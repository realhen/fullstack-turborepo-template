import type { Principal } from './principal'

export interface AuthenticationAdapter {
  authenticate(token: string): Promise<Principal>
}
