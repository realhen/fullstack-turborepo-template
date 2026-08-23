import { timingSafeEqual } from 'node:crypto'
import type { Principal } from './principal'

interface JwtClaims {
  sub?: string
  email?: unknown
  email_verified?: unknown
  scope?: unknown
  scp?: unknown
  permissions?: unknown
  client_id?: unknown
}

export class AuthenticationError extends Error {}

export interface AuthenticationAdapter {
  authenticate(token: string): Promise<Principal>
}

/** Secure default: protected routes never authenticate without configuration. */
export class DisabledAuthenticationAdapter implements AuthenticationAdapter {
  authenticate(): Promise<Principal> {
    return Promise.reject(new AuthenticationError('Authentication is disabled'))
  }
}

export class LocalTokenAuthenticationAdapter implements AuthenticationAdapter {
  constructor(
    private readonly token: string,
    private readonly principal: Principal,
  ) {}

  authenticate(token: string): Promise<Principal> {
    const expected = Buffer.from(this.token)
    const supplied = Buffer.from(token)
    if (
      expected.length !== supplied.length ||
      !timingSafeEqual(expected, supplied)
    ) {
      return Promise.reject(new AuthenticationError('Invalid bearer token'))
    }

    return Promise.resolve(this.principal)
  }
}

export class OidcJwksAuthenticationAdapter implements AuthenticationAdapter {
  private jwks?: unknown

  constructor(
    private readonly jwksUri: string,
    private readonly issuer: string,
    private readonly audience?: string,
    private readonly clientId?: string,
  ) {}

  async authenticate(token: string): Promise<Principal> {
    try {
      // jose is ESM-only. Dynamic import keeps this NestJS CommonJS app
      // provider-neutral without a runtime require() failure.
      const { createRemoteJWKSet, jwtVerify } = await import('jose')
      this.jwks ??= createRemoteJWKSet(new URL(this.jwksUri))
      const { payload } = await jwtVerify(
        token,
        this.jwks as ReturnType<typeof createRemoteJWKSet>,
        {
          ...(this.audience ? { audience: this.audience } : {}),
          issuer: this.issuer,
        },
      )
      if (this.clientId && payload.client_id !== this.clientId) {
        throw new AuthenticationError('Token client is invalid')
      }
      return principalFromJwt(payload, this.issuer)
    } catch {
      throw new AuthenticationError('Invalid bearer token')
    }
  }
}

export function principalFromJwt(
  payload: JwtClaims,
  provider: string,
): Principal {
  if (!payload.sub) {
    throw new AuthenticationError('Token subject is required')
  }

  const scopes = new Set<string>()
  if (typeof payload.scope === 'string') {
    for (const scope of payload.scope.split(/\s+/)) if (scope) scopes.add(scope)
  }
  if (Array.isArray(payload.scp)) {
    for (const scope of payload.scp)
      if (typeof scope === 'string') scopes.add(scope)
  }
  if (typeof payload.scp === 'string') {
    for (const scope of payload.scp.split(/\s+/)) if (scope) scopes.add(scope)
  }
  if (Array.isArray(payload.permissions)) {
    for (const permission of payload.permissions) {
      if (typeof permission === 'string') scopes.add(permission)
    }
  }

  return {
    id: payload.sub,
    ...(typeof payload.email === 'string' ? { email: payload.email } : {}),
    ...(typeof payload.email_verified === 'boolean'
      ? { emailVerified: payload.email_verified }
      : {}),
    provider,
    scopes: [...scopes],
  }
}
