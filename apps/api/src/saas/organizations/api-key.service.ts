import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto'
import { API_KEY_STORE, type ApiKeyStore } from './api-key.types'

const KEY_LENGTH = 64

function scrypt(secret: string, salt: Buffer, keyLength: number) {
  return new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(secret, salt, keyLength, (error, derivedKey) => {
      if (error) reject(error)
      else resolve(derivedKey)
    })
  })
}

@Injectable()
export class ApiKeyService {
  constructor(@Inject(API_KEY_STORE) private readonly apiKeys: ApiKeyStore) {}

  createServiceAccount(
    organizationId: string,
    actorId: string,
    input: { name: string; projectId?: string },
  ) {
    return this.apiKeys.createServiceAccount(organizationId, actorId, input)
  }

  async create(
    organizationId: string,
    actorId: string,
    input: { expiresAt?: string; scopes: string[]; serviceAccountId: string },
  ) {
    const secret = randomBytes(32).toString('base64url')
    const prefix = `sk_${randomBytes(9).toString('base64url')}`
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : undefined
    if (
      expiresAt &&
      (Number.isNaN(expiresAt.valueOf()) || expiresAt <= new Date())
    ) {
      throw new ConflictException('API key expiry must be in the future')
    }
    const normalizedScopes = [
      ...new Set(input.scopes.map((scope) => scope.trim()).filter(Boolean)),
    ]
    if (!normalizedScopes.length) {
      throw new ConflictException('At least one API key scope is required')
    }
    try {
      const key = await this.apiKeys.createApiKey(organizationId, actorId, {
        ...(expiresAt ? { expiresAt } : {}),
        prefix,
        scopes: normalizedScopes,
        secretHash: await this.hash(secret),
        serviceAccountId: input.serviceAccountId,
      })
      // This is the only response that contains the credential material.
      return {
        ...key,
        apiKey: `${prefix}.${secret}`,
        ...(expiresAt ? { expiresAt } : {}),
      }
    } catch (error) {
      if (this.isDuplicate(error))
        throw new ConflictException('Please retry API key creation')
      throw error
    }
  }

  async verify(apiKey: string): Promise<{
    organizationId: string
    projectId?: string
    scopes: string[]
    serviceAccountId: string
  } | null> {
    const parsed = this.parse(apiKey)
    if (!parsed) return null
    const record = await this.apiKeys.resolve(parsed.prefix)
    if (
      !record ||
      record.revokedAt ||
      record.serviceAccountStatus !== 'active' ||
      (record.expiresAt && record.expiresAt <= new Date()) ||
      !(await this.matches(parsed.secret, record.secretHash))
    ) {
      return null
    }
    await this.apiKeys.markUsed(
      record.organizationId,
      record.apiKeyId,
      record.serviceAccountId,
    )
    return {
      organizationId: record.organizationId,
      ...(record.projectId ? { projectId: record.projectId } : {}),
      scopes: record.scopes,
      serviceAccountId: record.serviceAccountId,
    }
  }

  async revoke(organizationId: string, actorId: string, apiKeyId: string) {
    const revoked = await this.apiKeys.revoke(organizationId, actorId, apiKeyId)
    if (!revoked) throw new NotFoundException('API key was not found')
    return { revoked: true }
  }

  private async hash(secret: string): Promise<string> {
    const salt = randomBytes(16)
    const derived = await scrypt(secret, salt, KEY_LENGTH)
    return `scrypt$${salt.toString('base64url')}$${Buffer.from(
      derived,
    ).toString('base64url')}`
  }

  private async matches(secret: string, encoded: string): Promise<boolean> {
    const [algorithm, saltEncoded, hashEncoded] = encoded.split('$')
    if (algorithm !== 'scrypt' || !saltEncoded || !hashEncoded) return false
    try {
      const expected = Buffer.from(hashEncoded, 'base64url')
      const actual = Buffer.from(
        await scrypt(
          secret,
          Buffer.from(saltEncoded, 'base64url'),
          expected.length,
        ),
      )
      return (
        expected.length === actual.length && timingSafeEqual(expected, actual)
      )
    } catch {
      return false
    }
  }

  private parse(value: string): { prefix: string; secret: string } | null {
    const match = /^(sk_[A-Za-z0-9_-]{8,64})\.([A-Za-z0-9_-]{32,128})$/.exec(
      value,
    )
    const prefix = match?.[1]
    const secret = match?.[2]
    return prefix && secret ? { prefix, secret } : null
  }

  private isDuplicate(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    )
  }
}
