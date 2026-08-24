import { describe, expect, it } from 'vitest'
import { createFlowStateCodec } from './flow-state'
import { passwordAuthentication } from './password-service'
describe('password orchestration', () => {
  it('keeps a server transition token encrypted rather than returning it to the browser', async () => {
    const result = await passwordAuthentication({
      provider: {
        authenticateWithPassword: () =>
          Promise.resolve({
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
  it('seals an unambiguous server-resolved SSO connection instead of returning it', async () => {
    const flow = createFlowStateCodec('x'.repeat(32))
    const result = await passwordAuthentication({
      provider: {
        authenticateWithPassword: () =>
          Promise.resolve({ status: 'sso-required' }),
        resolveSsoConnection: () => Promise.resolve({ connectionId: 'conn' }),
      } as never,
      flow,
      context: {},
      email: 'u@example.com',
      password: 'password',
      returnTo: '/app',
    })
    expect('flow' in result && result.flow).not.toContain('conn')
    if (!('flow' in result)) throw new Error('Expected sealed SSO flow')
    await expect(flow.unseal(result.flow, 'sso')).resolves.toMatchObject({
      connectionId: 'conn',
    })
  })
  it('seals exactly one connection returned by a trusted SSO transition', async () => {
    const flow = createFlowStateCodec('x'.repeat(32))
    const result = await passwordAuthentication({
      provider: {
        authenticateWithPassword: () =>
          Promise.resolve({
            status: 'sso-required',
            connectionIds: ['conn_from_exception'],
          }),
        resolveSsoConnection: () => Promise.resolve(null),
      } as never,
      flow,
      context: {},
      email: '',
      password: 'password',
      returnTo: '/app',
    })

    if (!('flow' in result)) throw new Error('Expected sealed SSO flow')
    await expect(flow.unseal(result.flow, 'sso')).resolves.toMatchObject({
      connectionId: 'conn_from_exception',
    })
  })
})
