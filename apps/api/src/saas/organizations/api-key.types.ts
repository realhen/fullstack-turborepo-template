export type ApiKeyRecord = {
  apiKeyId: string
  expiresAt: Date | null
  organizationId: string
  projectId: string | null
  revokedAt: Date | null
  scopes: string[]
  secretHash: string
  serviceAccountId: string
  serviceAccountStatus: string
}

export interface ApiKeyStore {
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
  ): Promise<{ id: string; prefix: string }>
  createServiceAccount(
    organizationId: string,
    actorId: string,
    input: { name: string; projectId?: string },
  ): Promise<{ id: string; name: string }>
  markUsed(organizationId: string, apiKeyId: string, serviceAccountId: string): Promise<void>
  resolve(prefix: string): Promise<ApiKeyRecord | null>
  revoke(organizationId: string, actorId: string, apiKeyId: string): Promise<boolean>
}

export const API_KEY_STORE = Symbol('API_KEY_STORE')
