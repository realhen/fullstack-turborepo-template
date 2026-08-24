import { describe, expect, it, vi } from 'vitest'
import { createFlowStateCodec } from './flow-state'
import { passwordAuthentication, signUpWithEmailCode } from './password-service'
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

  it('gives new and duplicate sign-ups the same public email-code continuation', async () => {
    const flow = createFlowStateCodec('x'.repeat(32))
    const successfulMagicStart = vi.fn().mockResolvedValue({})
    const duplicateMagicStart = vi.fn().mockResolvedValue({})
    const input = {
      flow,
      context: {},
      email: 'u@example.com',
      password: 'password',
      returnTo: '/app',
    }
    const successful = await signUpWithEmailCode({
      ...input,
      provider: {
        signUp: () =>
          Promise.resolve({ radarAuthAttemptId: 'attempt_from_creation' }),
        sendMagicAuthCode: successfulMagicStart,
      } as never,
    })
    const duplicate = await signUpWithEmailCode({
      ...input,
      provider: {
        signUp: () => Promise.reject(new Error('user already exists')),
        sendMagicAuthCode: duplicateMagicStart,
      } as never,
    })

    expect(successful.destination).toBe('/magic-auth?code=1')
    expect(duplicate.destination).toBe(successful.destination)
    expect(successfulMagicStart).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'u@example.com',
        radarAuthAttemptId: 'attempt_from_creation',
      }),
    )
    expect(duplicateMagicStart).toHaveBeenCalledWith({ email: 'u@example.com' })
    const successfulState = await flow.unseal(successful.flow, 'magic-auth')
    const duplicateState = await flow.unseal(duplicate.flow, 'magic-auth')
    expect(successfulState).toMatchObject({
      email: 'u@example.com',
      kind: 'magic-auth',
      returnTo: '/app',
    })
    expect(duplicateState).toMatchObject({
      email: successfulState.email,
      kind: successfulState.kind,
      returnTo: successfulState.returnTo,
    })
    expect(
      Math.abs(successfulState.expiresAt - duplicateState.expiresAt),
    ).toBeLessThan(100)
  })
})
