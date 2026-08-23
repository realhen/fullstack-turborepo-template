import { Injectable, Inject } from '@nestjs/common'
import type { AuthenticationAdapter } from './authentication.adapter'
import type { Principal } from './principal'

export const AUTHENTICATION_ADAPTER = Symbol('AUTHENTICATION_ADAPTER')

@Injectable()
export class AuthenticationService {
  constructor(
    @Inject(AUTHENTICATION_ADAPTER)
    private readonly adapter: AuthenticationAdapter,
  ) {}

  authenticate(authorization?: string): Promise<Principal> {
    const match = /^Bearer ([^\s]+)$/i.exec(authorization ?? '')
    if (!match) {
      return Promise.reject(new Error('A Bearer token is required'))
    }
    const token = match[1]
    if (!token) {
      return Promise.reject(new Error('A Bearer token is required'))
    }
    return this.adapter.authenticate(token)
  }
}
