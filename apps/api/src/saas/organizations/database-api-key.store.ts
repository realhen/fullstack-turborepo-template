import {
  PreTenantAuthorizationLookup,
  withTenantRepository,
} from '@repo/database'
import type { Pool } from 'pg'
import type { ApiKeyStore } from './api-key.types'

export class DatabaseApiKeyStore implements ApiKeyStore {
  private readonly lookup: PreTenantAuthorizationLookup

  constructor(private readonly pool: Pool) {
    this.lookup = new PreTenantAuthorizationLookup(pool)
  }

  createServiceAccount(
    organizationId: string,
    actorId: string,
    input: { name: string; projectId?: string },
  ) {
    return withTenantRepository(
      this.pool,
      { actorId, organizationId },
      (repository) =>
        repository.createServiceAccount({ actorId, organizationId }, input),
    )
  }

  createApiKey(
    organizationId: string,
    actorId: string,
    input: {
      expiresAt?: Date
      prefix: string
      scopes: string[]
      secretHash: string
      serviceAccountId: string
    },
  ) {
    return withTenantRepository(
      this.pool,
      { actorId, organizationId },
      (repository) =>
        repository.createApiKey({ actorId, organizationId }, input),
    )
  }

  resolve(prefix: string) {
    return this.lookup.resolveApiKey(prefix)
  }

  markUsed(
    organizationId: string,
    apiKeyId: string,
    serviceAccountId: string,
  ): Promise<void> {
    return withTenantRepository(
      this.pool,
      { actorId: serviceAccountId, organizationId },
      (repository) =>
        repository.markApiKeyUsed(
          { actorId: serviceAccountId, organizationId },
          apiKeyId,
        ),
    )
  }

  revoke(organizationId: string, actorId: string, apiKeyId: string) {
    return withTenantRepository(
      this.pool,
      { actorId, organizationId },
      (repository) =>
        repository.revokeApiKey({ actorId, organizationId }, apiKeyId),
    )
  }
}
