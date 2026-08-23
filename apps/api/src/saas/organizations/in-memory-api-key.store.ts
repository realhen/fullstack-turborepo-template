import { randomUUID } from 'node:crypto'
import type { ApiKeyRecord, ApiKeyStore } from './api-key.types'

type Account = {
  id: string
  name: string
  organizationId: string
  projectId?: string
  status: string
}

export class InMemoryApiKeyStore implements ApiKeyStore {
  private readonly accounts = new Map<string, Account>()
  private readonly keys = new Map<string, ApiKeyRecord>()

  createServiceAccount(
    organizationId: string,
    _actorId: string,
    input: { name: string; projectId?: string },
  ): Promise<{ id: string; name: string }> {
    void _actorId
    const account = {
      ...input,
      id: randomUUID(),
      organizationId,
      status: 'active',
    }
    this.accounts.set(account.id, account)
    return Promise.resolve({ id: account.id, name: account.name })
  }

  createApiKey(
    organizationId: string,
    _actorId: string,
    input: {
      expiresAt?: Date
      prefix: string
      scopes: string[]
      secretHash: string
      serviceAccountId: string
    },
  ): Promise<{ id: string; prefix: string }> {
    void _actorId
    if (this.keys.has(input.prefix)) {
      return Promise.reject(
        Object.assign(new Error('Duplicate API key'), { code: '23505' }),
      )
    }
    const account = this.accounts.get(input.serviceAccountId)
    if (
      !account ||
      account.organizationId !== organizationId ||
      account.status !== 'active'
    ) {
      return Promise.reject(new Error('Active service account was not found'))
    }
    const id = randomUUID()
    this.keys.set(input.prefix, {
      apiKeyId: id,
      expiresAt: input.expiresAt ?? null,
      organizationId,
      projectId: account.projectId ?? null,
      revokedAt: null,
      scopes: input.scopes,
      secretHash: input.secretHash,
      serviceAccountId: account.id,
      serviceAccountStatus: account.status,
    })
    return Promise.resolve({ id, prefix: input.prefix })
  }

  resolve(prefix: string): Promise<ApiKeyRecord | null> {
    return Promise.resolve(this.keys.get(prefix) ?? null)
  }

  markUsed(): Promise<void> {
    return Promise.resolve()
  }

  revoke(
    organizationId: string,
    _actorId: string,
    apiKeyId: string,
  ): Promise<boolean> {
    void _actorId
    const key = [...this.keys.values()].find(
      (candidate) => candidate.apiKeyId === apiKeyId,
    )
    if (!key || key.organizationId !== organizationId || key.revokedAt)
      return Promise.resolve(false)
    key.revokedAt = new Date()
    return Promise.resolve(true)
  }
}
