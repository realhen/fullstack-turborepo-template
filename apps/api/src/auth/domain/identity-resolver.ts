import type { Principal } from './principal'

/**
 * Maps a verified provider subject to the application's durable user record.
 * Authentication adapters remain unaware of application databases.
 */
export interface IdentityResolver {
  resolve(principal: Principal): Promise<Principal>
}

export const IDENTITY_RESOLVER = Symbol('IDENTITY_RESOLVER')
