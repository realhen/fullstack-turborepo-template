import { describe, expect, it } from 'vitest'
import { startMagicAuth, startRecovery } from './recovery-service'
import { createFlowStateCodec } from './flow-state'
describe('recovery', () =>
  it('returns identical public confirmation', async () => {
    await expect(
      startRecovery({
        start: () => Promise.reject(new Error('not found')),
        email: 'user@example.com',
      }),
    ).resolves.toEqual({
      message: 'If an account exists, a recovery email has been sent.',
    })
  }))

it('seals the Magic Auth email and opaque Radar attempt', async () => {
  const flow = createFlowStateCodec('x'.repeat(32), () => 1)
  const value = await startMagicAuth({
    email: 'user@example.com',
    returnTo: '/app',
    flow,
    start: () => Promise.resolve({ radarAuthAttemptId: 'radar_attempt' }),
  })

  expect(value).not.toContain('radar_attempt')
  await expect(flow.unseal(value, 'magic-auth')).resolves.toMatchObject({
    email: 'user@example.com',
    radarAuthAttemptId: 'radar_attempt',
  })
})

it('starts Magic Auth with the same public continuation when WorkOS rejects', async () => {
  const flow = createFlowStateCodec('y'.repeat(32), () => 1)
  const success = await startMagicAuth({
    email: 'user@example.com',
    returnTo: '/app',
    flow,
    start: () => Promise.resolve({}),
  })
  const failure = await startMagicAuth({
    email: 'user@example.com',
    returnTo: '/app',
    flow,
    start: () => Promise.reject(new Error('unknown user')),
  })

  await expect(flow.unseal(success, 'magic-auth')).resolves.toMatchObject({
    email: 'user@example.com',
    returnTo: '/app',
  })
  await expect(flow.unseal(failure, 'magic-auth')).resolves.toMatchObject({
    email: 'user@example.com',
    returnTo: '/app',
  })
})
