/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
import { createHash } from 'node:crypto'
import { WorkOS } from '@workos-inc/node'
import { transitionFromError } from './provider-errors'
import type {
  AuthenticationOutcome,
  AuthenticationProvider,
  AuthenticatedUser,
  ProviderSession,
} from './provider'
import type { WebAuthConfig } from './config'
type User = {
  id: string
  email: string
  emailVerified: boolean
  firstName: string | null
  lastName: string | null
}
type Auth = { accessToken: string; sealedSession?: string; user: User }
export type WorkosClient = Pick<WorkOS, 'multiFactorAuth' | 'sso'> & {
  userManagement: Pick<
    WorkOS['userManagement'],
    | 'authenticateWithCode'
    | 'authenticateWithEmailVerification'
    | 'authenticateWithMagicAuth'
    | 'authenticateWithOrganizationSelection'
    | 'authenticateWithPassword'
    | 'authenticateWithRadarEmailChallenge'
    | 'authenticateWithRadarSmsChallenge'
    | 'authenticateWithTotp'
    | 'createMagicAuth'
    | 'createPasswordReset'
    | 'createUser'
    | 'getAuthorizationUrl'
    | 'loadSealedSession'
    | 'resetPassword'
    | 'sendRadarSmsChallenge'
  >
}
function user(value: User): AuthenticatedUser {
  return {
    email: value.email,
    emailVerified: value.emailVerified,
    ...(value.firstName ? { firstName: value.firstName } : {}),
    id: value.id,
    ...(value.lastName ? { lastName: value.lastName } : {}),
  }
}
function authenticated(response: Auth): AuthenticationOutcome {
  if (!response.sealedSession)
    throw new Error('WorkOS did not return a sealed session')
  return {
    accessToken: response.accessToken,
    sealedSession: response.sealedSession,
    status: 'authenticated',
    user: user(response.user),
  }
}
function context(input: {
  ipAddress?: string
  userAgent?: string
  signalsId?: string
}) {
  return {
    ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
    ...(input.userAgent ? { userAgent: input.userAgent } : {}),
    ...(input.signalsId ? { signalsId: input.signalsId } : {}),
  }
}
export function pkceChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url')
}
export class WorkosAuthenticationProvider implements AuthenticationProvider {
  private readonly client: WorkosClient
  constructor(
    private readonly config: Extract<WebAuthConfig, { mode: 'workos' }>,
    client?: WorkosClient,
  ) {
    this.client =
      client ??
      (new WorkOS(config.apiKey, {
        clientId: config.clientId,
      }) as unknown as WorkosClient)
  }
  private async transition(
    operation: () => Promise<Auth>,
  ): Promise<AuthenticationOutcome> {
    try {
      return authenticated(await operation())
    } catch (error) {
      const transition = transitionFromError(error)
      if (transition) return transition
      throw error
    }
  }
  async signUp(input: Parameters<AuthenticationProvider['signUp']>[0]) {
    const createdUser = await this.client.userManagement.createUser!({
      ...context(input),
      email: input.email,
      ...(input.firstName ? { firstName: input.firstName } : {}),
      ...(input.lastName ? { lastName: input.lastName } : {}),
      password: input.password,
    } as never)
    return this.authenticateWithPassword({
      ...input,
      ...(createdUser.radarAuthAttemptId
        ? { radarAuthAttemptId: createdUser.radarAuthAttemptId }
        : {}),
    })
  }
  async authenticateWithPassword(
    input: Parameters<AuthenticationProvider['authenticateWithPassword']>[0],
  ) {
    return this.transition(() =>
      this.client.userManagement.authenticateWithPassword({
        ...context(input),
        email: input.email,
        password: input.password,
        ...(input.radarAuthAttemptId
          ? { radarAuthAttemptId: input.radarAuthAttemptId }
          : {}),
        session: {
          cookiePassword: this.config.cookiePassword,
          sealSession: true,
        },
      }),
    )
  }
  async sendMagicAuthCode(
    input: Parameters<AuthenticationProvider['sendMagicAuthCode']>[0],
  ) {
    return this.client.userManagement.createMagicAuth!({
      ...context(input),
      email: input.email,
    } as never) as Promise<{ radarAuthAttemptId?: string }>
  }
  async authenticateWithMagicAuth(
    input: Parameters<AuthenticationProvider['authenticateWithMagicAuth']>[0],
  ) {
    return this.transition(() =>
      this.client.userManagement.authenticateWithMagicAuth({
        ...context(input),
        code: input.code,
        email: input.email,
        ...(input.radarAuthAttemptId
          ? { radarAuthAttemptId: input.radarAuthAttemptId }
          : {}),
        session: {
          cookiePassword: this.config.cookiePassword,
          sealSession: true,
        },
      }),
    )
  }
  async verifyEmail(
    input: Parameters<AuthenticationProvider['verifyEmail']>[0],
  ) {
    return this.transition(() =>
      this.client.userManagement.authenticateWithEmailVerification({
        ...context(input),
        code: input.code,
        pendingAuthenticationToken: input.pendingAuthenticationToken,
        session: {
          cookiePassword: this.config.cookiePassword,
          sealSession: true,
        },
      }),
    )
  }
  async startPasswordReset(
    input: Parameters<AuthenticationProvider['startPasswordReset']>[0],
  ) {
    await this.client.userManagement.createPasswordReset!(input as never)
  }
  async resetPassword(
    input: Parameters<AuthenticationProvider['resetPassword']>[0],
  ) {
    await this.client.userManagement.resetPassword!({
      newPassword: input.password,
      token: input.token,
    } as never)
  }
  async enrollTotp(
    input: Parameters<AuthenticationProvider['enrollTotp']>[0],
  ): Promise<Awaited<ReturnType<AuthenticationProvider['enrollTotp']>>> {
    const result = await this.client.multiFactorAuth.createUserAuthFactor({
      type: 'totp',
      userId: input.userId,
    })
    return {
      challengeId: result.authenticationChallenge.id,
      secret: result.authenticationFactor.totp.secret,
      uri: result.authenticationFactor.totp.uri,
    }
  }
  async startTotpChallenge(
    input: Parameters<AuthenticationProvider['startTotpChallenge']>[0],
  ) {
    const challenge = await this.client.multiFactorAuth.challengeFactor({
      authenticationFactorId: input.factorId,
    })
    return { challengeId: challenge.id }
  }
  async authenticateTotp(
    input: Parameters<AuthenticationProvider['authenticateTotp']>[0],
  ) {
    if (!input.challengeId)
      throw new Error('WorkOS TOTP requires an authentication challenge ID')
    return this.transition(() =>
      this.client.userManagement.authenticateWithTotp({
        ...context(input),
        authenticationChallengeId: input.challengeId,
        code: input.code,
        pendingAuthenticationToken: input.pendingAuthenticationToken,
        session: {
          cookiePassword: this.config.cookiePassword,
          sealSession: true,
        },
      }),
    )
  }
  async startRadarChallenge(
    input: Parameters<AuthenticationProvider['startRadarChallenge']>[0],
  ) {
    return this.client.userManagement.sendRadarSmsChallenge({
      ...context(input),
      userId: input.userId,
      pendingAuthenticationToken: input.pendingAuthenticationToken,
      phoneNumber: input.phoneNumber,
    })
  }
  async completeRadarChallenge(
    input: Parameters<AuthenticationProvider['completeRadarChallenge']>[0],
  ) {
    if (input.type === 'sms') {
      if (!input.verificationId || !input.phoneNumber)
        throw new Error(
          'WorkOS Radar SMS completion requires server flow context',
        )
      const { phoneNumber, verificationId } = input
      return this.transition(() =>
        this.client.userManagement.authenticateWithRadarSmsChallenge({
          code: input.code,
          pendingAuthenticationToken: input.pendingAuthenticationToken,
          phoneNumber,
          verificationId,
          session: {
            cookiePassword: this.config.cookiePassword,
            sealSession: true,
          },
        }),
      )
    }
    if (!input.challengeId)
      throw new Error(
        'WorkOS Radar email completion requires server flow context',
      )
    const challengeId = input.challengeId
    return this.transition(() =>
      this.client.userManagement.authenticateWithRadarEmailChallenge({
        code: input.code,
        pendingAuthenticationToken: input.pendingAuthenticationToken,
        radarChallengeId: challengeId,
        session: {
          cookiePassword: this.config.cookiePassword,
          sealSession: true,
        },
      }),
    )
  }
  authorizationUrl(
    input: Parameters<AuthenticationProvider['authorizationUrl']>[0],
  ) {
    return Promise.resolve(
      this.client.userManagement.getAuthorizationUrl!({
        ...(input.connectionId ? { connectionId: input.connectionId } : {}),
        ...(input.provider ? { provider: input.provider } : {}),
        clientId: this.config.clientId,
        codeChallenge: pkceChallenge(input.codeVerifier),
        codeChallengeMethod: 'S256',
        redirectUri: this.config.redirectUri,
        state: input.state,
      } as never) as string,
    )
  }
  async exchangeAuthorizationCode(
    input: Parameters<AuthenticationProvider['exchangeAuthorizationCode']>[0],
  ) {
    return this.transition(() =>
      this.client.userManagement.authenticateWithCode({
        ...context(input),
        clientId: this.config.clientId,
        code: input.code,
        codeVerifier: input.codeVerifier,
        session: {
          cookiePassword: this.config.cookiePassword,
          sealSession: true,
        },
      }),
    )
  }
  async authenticateWithOrganizationSelection(
    input: Parameters<
      AuthenticationProvider['authenticateWithOrganizationSelection']
    >[0],
  ) {
    return this.transition(() =>
      this.client.userManagement.authenticateWithOrganizationSelection({
        ...context(input),
        organizationId: input.organizationId,
        pendingAuthenticationToken: input.pendingAuthenticationToken,
        session: {
          cookiePassword: this.config.cookiePassword,
          sealSession: true,
        },
      }),
    )
  }
  async resolveSsoConnection(email: string) {
    const domain = email.trim().toLowerCase().split('@')[1]
    if (!domain) return null
    const connections = await this.client.sso.listConnections({ domain })
    const active = connections.data.filter(
      (connection) => connection.state === 'active',
    )
    return active.length === 1 ? { connectionId: active[0]!.id } : null
  }
  loadSession(sealedSession: string): Promise<ProviderSession> {
    const session = this.client.userManagement.loadSealedSession!({
      cookiePassword: this.config.cookiePassword,
      sessionData: sealedSession,
    } as never) as {
      authenticate(): Promise<{
        authenticated: boolean
        accessToken?: string
        user?: User
      }>
      refresh(input: { cookiePassword: string }): Promise<{
        authenticated: boolean
        sealedSession?: string
        session?: Auth
      }>
      getLogoutUrl(input: { returnTo: string }): Promise<string>
    }
    const password = this.config.cookiePassword
    return Promise.resolve({
      async authenticate() {
        const response = await session.authenticate()
        return response.authenticated && response.accessToken && response.user
          ? {
              accessToken: response.accessToken,
              authenticated: true,
              user: user(response.user),
            }
          : { authenticated: false }
      },
      async refresh() {
        const response = await session.refresh({ cookiePassword: password })
        return response.authenticated &&
          response.sealedSession &&
          response.session
          ? {
              accessToken: response.session.accessToken,
              authenticated: true,
              sealedSession: response.sealedSession,
              user: user(response.session.user),
            }
          : { authenticated: false }
      },
      logoutUrl: (returnTo) => session.getLogoutUrl({ returnTo }),
    })
  }
}
