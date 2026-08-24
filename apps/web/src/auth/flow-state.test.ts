/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
import { describe, expect, it } from 'vitest'
import { createFlowStateCodec } from './flow-state'
describe('flow state', () => {
  const state = {
    kind: 'email-verification' as const,
    pendingAuthenticationToken: 'pending-secret',
    returnTo: '/app',
    expiresAt: 2_000,
  }
  it('seals state without plaintext and rejects tampering, expiry, and kind mismatches', async () => {
    const codec = createFlowStateCodec('x'.repeat(32), () => 1_000)
    const value = await codec.seal(state)
    expect(value).not.toContain('pending-secret')
    await expect(codec.unseal(value, 'email-verification')).resolves.toEqual(
      state,
    )
    await expect(codec.unseal(`${value}x`)).rejects.toThrow()
    await expect(codec.unseal(value, 'mfa')).rejects.toThrow()
    await expect(
      createFlowStateCodec('x'.repeat(32), () => 2_001).unseal(value),
    ).rejects.toThrow()
  })
  it.each([
    {
      kind: 'magic-auth',
      email: 'user@example.com',
      returnTo: '/app',
      expiresAt: 2_000,
    },
    {
      kind: 'mfa',
      pendingAuthenticationToken: 'pending',
      factors: [{ id: 'factor', type: 'totp' }],
      returnTo: '/app',
      expiresAt: 2_000,
    },
    {
      kind: 'sso',
      connectionId: 'conn',
      email: 'user@example.com',
      returnTo: '/app',
      expiresAt: 2_000,
    },
    {
      kind: 'mfa-enrollment',
      pendingAuthenticationToken: 'pending',
      userId: 'user',
      email: 'user@example.com',
      returnTo: '/app',
      expiresAt: 2_000,
    },
    {
      kind: 'organization-selection',
      pendingAuthenticationToken: 'pending',
      organizations: [{ id: 'org', name: 'Organization' }],
      returnTo: '/app',
      expiresAt: 2_000,
    },
    {
      kind: 'radar-email',
      pendingAuthenticationToken: 'pending',
      challengeId: 'challenge',
      returnTo: '/app',
      expiresAt: 2_000,
    },
    {
      kind: 'radar-sms',
      pendingAuthenticationToken: 'pending',
      userId: 'user',
      verificationId: 'verification',
      phoneNumber: '+14165551234',
      returnTo: '/app',
      expiresAt: 2_000,
    },
    {
      kind: 'oauth',
      state: 'state',
      codeVerifier: 'verifier',
      returnTo: '/app',
      expiresAt: 2_000,
    },
    { kind: 'password-reset', token: 'reset', expiresAt: 2_000 },
  ])('round trips the $kind variant', async (state) => {
    const codec = createFlowStateCodec('x'.repeat(32), () => 1_000)
    await expect(codec.unseal(await codec.seal(state as any))).resolves.toEqual(
      state,
    )
  })

  it('rejects a malformed decrypted variant payload', async () => {
    const codec = createFlowStateCodec('x'.repeat(32), () => 1_000)
    await expect(
      codec.unseal(
        await codec.seal({
          kind: 'mfa',
          returnTo: '/app',
          expiresAt: 2_000,
        } as any),
      ),
    ).rejects.toThrow()
  })
})
