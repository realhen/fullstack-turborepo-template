import { describe, expect, it } from 'vitest'
import { createFlowStateCodec } from './flow-state'
import { passwordAuthentication } from './password-service'
describe('password orchestration', () => {
  it('keeps a server transition token encrypted rather than returning it to the browser', async () => {
    const result = await passwordAuthentication({
      provider: {
        authenticateWithPassword: () => Promise.resolve({
          status: 'mfa-enrollment-required',
          pendingAuthenticationToken: 'secret',
          user: { id: 'u', email: 'u@example.com' },
        }),
      } as never,
      flow: createFlowStateCodec('x'.repeat(32)),
      context: {},
      email: 'u@example.com',
      password: 'password',
      returnTo: '/app',
    })
    expect('flow' in result && result.flow).not.toContain('secret')
  })
})
