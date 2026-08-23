import { describe, expect, it } from 'vitest'
import { assertTenantContext } from '../src/tenant'

describe('assertTenantContext', () => {
  it('requires both the authoritative organization and actor', () => {
    expect(() =>
      assertTenantContext({ actorId: '', organizationId: 'org-1' }),
    ).toThrow('Tenant context requires an organization and actor')
    expect(() =>
      assertTenantContext({ actorId: 'user-1', organizationId: '' }),
    ).toThrow('Tenant context requires an organization and actor')
  })
})
