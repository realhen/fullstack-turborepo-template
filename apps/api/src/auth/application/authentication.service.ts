import { Injectable, Inject } from '@nestjs/common'
import type { AuthenticationAdapter } from '../infrastructure/authentication.adapter'
import {
  IDENTITY_RESOLVER,
  type IdentityResolver,
} from '../domain/identity-resolver'
import type { Principal } from '../domain/principal'

export const AUTHENTICATION_ADAPTER = Symbol('AUTHENTICATION_ADAPTER')

@Injectable()
export class AuthenticationService {
  constructor(
    @Inject(AUTHENTICATION_ADAPTER)
    private readonly adapter: AuthenticationAdapter,
    @Inject(IDENTITY_RESOLVER)
    private readonly identityResolver: IdentityResolver,
  ) {}

  async authenticate(authorization?: string): Promise<Principal> {
    const match = /^Bearer ([^\s]+)$/i.exec(authorization ?? '')
    if (!match) {
      throw new Error('A Bearer token is required')
    }
    const token = match[1]
    if (!token) {
      throw new Error('A Bearer token is required')
    }
    const principal = await this.adapter.authenticate(token)
    return this.identityResolver.resolve(principal)
  }
}
