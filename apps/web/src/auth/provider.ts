import type { AuthRequestContext } from './request-context'
export interface AuthenticatedUser {
  id: string
  email: string
  emailVerified?: boolean
  firstName?: string
  lastName?: string
}
export interface TransitionUser {
  id: string
  email: string
}
export interface MfaFactor {
  id: string
  type: 'totp'
}
export interface OrganizationChoice {
  id: string
  name: string
}
export type RadarChallenge =
  | { type: 'email'; challengeId: string; user?: TransitionUser }
  | { type: 'sms'; user: TransitionUser }
export type AuthInput = AuthRequestContext & { signalsId?: string }
export type PasswordSignUpInput = AuthInput & {
  email: string
  password: string
  firstName?: string
  lastName?: string
}
export type PasswordSignInInput = AuthInput & {
  email: string
  password: string
  radarAuthAttemptId?: string
}
export type MagicAuthStartInput = AuthInput & { email: string }
export type MagicAuthStartResult = { radarAuthAttemptId?: string }
export type MagicAuthCompleteInput = AuthInput & {
  email: string
  code: string
  radarAuthAttemptId?: string
}
export type EmailVerificationInput = AuthInput & {
  code: string
  pendingAuthenticationToken: string
}
export type PasswordResetStartInput = { email: string }
export type PasswordResetCompleteInput = { token: string; password: string }
export type TotpEnrollmentInput = AuthInput & { userId: string }
export type TotpEnrollmentResult = {
  challengeId: string
  secret: string
  uri: string
}
export type TotpChallengeInput = AuthInput & {
  pendingAuthenticationToken: string
  code: string
  challengeId: string
}
export type TotpStartInput = { factorId: string }
export type RadarChallengeStartInput = AuthInput & {
  userId: string
  pendingAuthenticationToken: string
  phoneNumber: string
}
export type RadarChallengeStartResult = {
  verificationId: string
  phoneNumber: string
}
export type RadarChallengeCompleteInput = AuthInput & {
  pendingAuthenticationToken: string
  code: string
  type: 'email' | 'sms'
  challengeId?: string
  verificationId?: string
  phoneNumber?: string
}
export type AuthorizationUrlInput = AuthInput & {
  provider?: 'GoogleOAuth' | 'MicrosoftOAuth' | 'GitHubOAuth' | 'AppleOAuth'
  connectionId?: string
  state: string
  codeVerifier: string
}
export type AuthorizationCodeInput = AuthInput & {
  code: string
  codeVerifier: string
}
export type OrganizationSelectionInput = AuthInput & {
  pendingAuthenticationToken: string
  organizationId: string
}
export interface ProviderSession {
  authenticate(): Promise<{
    authenticated: boolean
    accessToken?: string
    user?: AuthenticatedUser
  }>
  refresh(): Promise<
    | {
        authenticated: true
        sealedSession: string
        accessToken: string
        user: AuthenticatedUser
      }
    | {
        authenticated: false
        retryable: boolean
        reason?: string
      }
  >
  logoutUrl(returnTo: string): Promise<string>
}
export type AuthenticationOutcome =
  | {
      status: 'authenticated'
      sealedSession: string
      accessToken: string
      user: AuthenticatedUser
    }
  | {
      status: 'email-verification-required'
      pendingAuthenticationToken: string
    }
  | {
      status: 'mfa-enrollment-required'
      pendingAuthenticationToken: string
      user: TransitionUser
    }
  | {
      status: 'mfa-required'
      pendingAuthenticationToken: string
      factors: readonly MfaFactor[]
    }
  | {
      status: 'radar-challenge'
      pendingAuthenticationToken: string
      challenge: RadarChallenge
    }
  | {
      status: 'organization-selection-required'
      pendingAuthenticationToken: string
      organizations: readonly OrganizationChoice[]
    }
  | {
      status: 'sso-required'
      email?: string
      connectionIds?: readonly string[]
    }
  | { status: 'blocked' }
export interface AuthenticationProvider {
  signUp(input: PasswordSignUpInput): Promise<void>
  authenticateWithPassword(
    input: PasswordSignInInput,
  ): Promise<AuthenticationOutcome>
  sendMagicAuthCode(input: MagicAuthStartInput): Promise<MagicAuthStartResult>
  authenticateWithMagicAuth(
    input: MagicAuthCompleteInput,
  ): Promise<AuthenticationOutcome>
  verifyEmail(input: EmailVerificationInput): Promise<AuthenticationOutcome>
  startPasswordReset(input: PasswordResetStartInput): Promise<void>
  resetPassword(input: PasswordResetCompleteInput): Promise<void>
  enrollTotp(input: TotpEnrollmentInput): Promise<TotpEnrollmentResult>
  startTotpChallenge(input: TotpStartInput): Promise<{ challengeId: string }>
  authenticateTotp(input: TotpChallengeInput): Promise<AuthenticationOutcome>
  startRadarChallenge(
    input: RadarChallengeStartInput,
  ): Promise<RadarChallengeStartResult>
  completeRadarChallenge(
    input: RadarChallengeCompleteInput,
  ): Promise<AuthenticationOutcome>
  authenticateWithOrganizationSelection(
    input: OrganizationSelectionInput,
  ): Promise<AuthenticationOutcome>
  authorizationUrl(input: AuthorizationUrlInput): Promise<string>
  exchangeAuthorizationCode(
    input: AuthorizationCodeInput,
  ): Promise<AuthenticationOutcome>
  resolveSsoConnection(email: string): Promise<{ connectionId: string } | null>
  loadSession(sealedSession: string): Promise<ProviderSession>
}
