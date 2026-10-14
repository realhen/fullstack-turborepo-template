import { describe, expect, it, vi } from 'vitest'
import { createFlowStateCodec } from './flow-state'
import {
  normalizeE164,
  selectOrganization,
  startRadarSmsChallenge,
  startTotpChallenge,
} from './challenge-service'
import type { AuthenticationProvider } from './provider'

const codec = createFlowStateCodec('test-password', () => 1)
const context = { ipAddress: '127.0.0.1', userAgent: 'test' }

describe('challenge service', () => {
  it('accepts only a factor sealed into the MFA flow', async () => {
    const flow = await codec.seal({
      kind: 'mfa',
      pendingAuthenticationToken: 'pending',
      factors: [{ id: 'factor_1', type: 'totp' }],
      returnTo: '/app',
      expiresAt: 2,
    })
    const start = vi.fn().mockResolvedValue({ challengeId: 'challenge_1' })
    const provider = {
      startTotpChallenge: start,
    } as unknown as AuthenticationProvider

    const next = await startTotpChallenge({
      provider,
      flow: codec,
      flowValue: flow,
      factorId: 'factor_1',
    })

    expect(start).toHaveBeenCalledWith({ factorId: 'factor_1' })
    await expect(
      startTotpChallenge({
        provider,
        flow: codec,
        flowValue: flow,
        factorId: 'other',
      }),
    ).rejects.toThrow('invalid')
    await expect(codec.unseal(next, 'mfa')).resolves.toMatchObject({
      challengeId: 'challenge_1',
    })
  })

  it('normalizes and seals Radar SMS verification context', async () => {
    const flow = await codec.seal({
      kind: 'radar-sms',
      pendingAuthenticationToken: 'pending',
      userId: 'user_1',
      returnTo: '/app',
      expiresAt: 2,
    })
    const start = vi.fn().mockResolvedValue({
      verificationId: 'verify_1',
      phoneNumber: '+14165551234',
    })
    const provider = {
      startRadarChallenge: start,
    } as unknown as AuthenticationProvider

    const next = await startRadarSmsChallenge({
      provider,
      flow: codec,
      flowValue: flow,
      phoneNumber: '+1 (416) 555-1234',
      context,
    })

    expect(normalizeE164('+1 (416) 555-1234')).toBe('+14165551234')
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        phoneNumber: '+14165551234',
      }),
    )
    await expect(codec.unseal(next, 'radar-sms')).resolves.toMatchObject({
      verificationId: 'verify_1',
      phoneNumber: '+14165551234',
    })
  })

  it('submits only an organization sealed in the pending flow', async () => {
    const flow = await codec.seal({
      kind: 'organization-selection',
      pendingAuthenticationToken: 'pending',
      organizations: [{ id: 'org_1', name: 'Organization' }],
      returnTo: '/app',
      expiresAt: 2,
    })
    const select = vi.fn().mockResolvedValue({ status: 'blocked' })
    const provider = {
      authenticateWithOrganizationSelection: select,
    } as unknown as AuthenticationProvider

    await selectOrganization({
      provider,
      flow: codec,
      flowValue: flow,
      organizationId: 'org_1',
      context,
    })

    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_1',
        pendingAuthenticationToken: 'pending',
      }),
    )
    await expect(
      selectOrganization({
        provider,
        flow: codec,
        flowValue: flow,
        organizationId: 'org_other',
        context,
      }),
    ).rejects.toThrow('invalid')
  })
})
