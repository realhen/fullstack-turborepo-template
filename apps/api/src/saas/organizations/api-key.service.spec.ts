import { describe, expect, it } from 'vitest'
import { InMemoryApiKeyStore } from './in-memory-api-key.store'
import { ApiKeyService } from './api-key.service'

describe('ApiKeyService', () => {
  it('verifies a one-time API key and rejects it after revocation', async () => {
    const service = new ApiKeyService(new InMemoryApiKeyStore())
    const account = await service.createServiceAccount('org-a', 'owner-a', {
      name: 'CI',
    })
    const key = await service.create('org-a', 'owner-a', {
      scopes: ['projects:read'],
      serviceAccountId: account.id,
    })

    await expect(service.verify(key.apiKey)).resolves.toMatchObject({
      organizationId: 'org-a',
      scopes: ['projects:read'],
      serviceAccountId: account.id,
    })
    await expect(service.verify(`${key.apiKey}tampered`)).resolves.toBeNull()
    await service.revoke('org-a', 'owner-a', key.id)
    await expect(service.verify(key.apiKey)).resolves.toBeNull()
  })

  it('does not revoke another tenant’s API key', async () => {
    const service = new ApiKeyService(new InMemoryApiKeyStore())
    const account = await service.createServiceAccount('org-a', 'owner-a', {
      name: 'CI',
    })
    const key = await service.create('org-a', 'owner-a', {
      scopes: ['projects:read'],
      serviceAccountId: account.id,
    })

    await expect(service.revoke('org-b', 'owner-b', key.id)).rejects.toThrow(
      'not found',
    )
    await expect(service.verify(key.apiKey)).resolves.not.toBeNull()
  })
})
