import { describe, expect, it } from 'vitest'
import { createFlowStateCodec } from './flow-state'
describe('flow state', () => {
  const state = { kind: 'email-verification' as const, pendingAuthenticationToken: 'pending-secret', returnTo: '/app', expiresAt: 2_000 }
  it('seals state without plaintext and rejects tampering, expiry, and kind mismatches', async () => {
    const codec = createFlowStateCodec('x'.repeat(32), () => 1_000)
    const value = await codec.seal(state)
    expect(value).not.toContain('pending-secret')
    await expect(codec.unseal(value, 'email-verification')).resolves.toEqual(state)
    await expect(codec.unseal(`${value}x`)).rejects.toThrow()
    await expect(codec.unseal(value, 'mfa')).rejects.toThrow()
    await expect(createFlowStateCodec('x'.repeat(32), () => 2_001).unseal(value)).rejects.toThrow()
  })
})
