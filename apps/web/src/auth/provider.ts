import type { AuthRequestContext } from './request-context'
export interface AuthenticatedUser { id: string; email: string; emailVerified?: boolean; firstName?: string; lastName?: string }
export interface MfaFactor { id: string; type: 'totp' }
export interface RadarChallenge { type: 'email' | 'sms'; challengeId: string }
export type AuthInput = AuthRequestContext & { signalsId?: string }
export type PasswordSignUpInput = AuthInput & { email: string; password: string; firstName?: string; lastName?: string }
export type PasswordSignInInput = AuthInput & { email: string; password: string }
export type MagicAuthStartInput = AuthInput & { email: string }
export type MagicAuthStartResult = { radarAuthAttemptId?: string }
export type MagicAuthCompleteInput = AuthInput & { email: string; code: string; radarAuthAttemptId?: string }
export type EmailVerificationInput = AuthInput & { code: string; pendingAuthenticationToken: string }
export type PasswordResetStartInput = { email: string }
export type PasswordResetCompleteInput = { token: string; password: string }
export type TotpEnrollmentInput = AuthInput & { pendingAuthenticationToken: string }
export type TotpEnrollmentResult = { challengeId: string; secret: string; uri: string }
export type TotpChallengeInput = AuthInput & { pendingAuthenticationToken: string; code: string; challengeId?: string }
export type RadarChallengeStartInput = AuthInput & { pendingAuthenticationToken: string; challengeId: string; phoneNumber?: string }
export type RadarChallengeStartResult = void
export type RadarChallengeCompleteInput = AuthInput & { pendingAuthenticationToken: string; challengeId: string; code: string; type: 'email' | 'sms' }
export type AuthorizationUrlInput = AuthInput & { provider?: string; organizationId?: string; state: string; codeVerifier: string }
export type AuthorizationCodeInput = AuthInput & { code: string; codeVerifier: string }
export interface ProviderSession { authenticate(): Promise<{ authenticated: boolean; accessToken?: string; user?: AuthenticatedUser }>; refresh(): Promise<{ authenticated: boolean; sealedSession?: string; accessToken?: string; user?: AuthenticatedUser }>; logoutUrl(returnTo: string): Promise<string> }
export type AuthenticationOutcome = { status: 'authenticated'; sealedSession: string; accessToken: string; user: AuthenticatedUser } | { status: 'email-verification-required'; pendingAuthenticationToken: string } | { status: 'mfa-required'; pendingAuthenticationToken: string; factors: readonly MfaFactor[] } | { status: 'radar-challenge'; pendingAuthenticationToken: string; challenge: RadarChallenge } | { status: 'blocked' }
export interface AuthenticationProvider { signUp(input: PasswordSignUpInput): Promise<AuthenticationOutcome>; authenticateWithPassword(input: PasswordSignInInput): Promise<AuthenticationOutcome>; sendMagicAuthCode(input: MagicAuthStartInput): Promise<MagicAuthStartResult>; authenticateWithMagicAuth(input: MagicAuthCompleteInput): Promise<AuthenticationOutcome>; verifyEmail(input: EmailVerificationInput): Promise<AuthenticationOutcome>; startPasswordReset(input: PasswordResetStartInput): Promise<void>; resetPassword(input: PasswordResetCompleteInput): Promise<void>; enrollTotp(input: TotpEnrollmentInput): Promise<TotpEnrollmentResult>; authenticateTotp(input: TotpChallengeInput): Promise<AuthenticationOutcome>; startRadarChallenge(input: RadarChallengeStartInput): Promise<RadarChallengeStartResult>; completeRadarChallenge(input: RadarChallengeCompleteInput): Promise<AuthenticationOutcome>; authorizationUrl(input: AuthorizationUrlInput): Promise<string>; exchangeAuthorizationCode(input: AuthorizationCodeInput): Promise<AuthenticationOutcome>; resolveSsoOrganization(email: string): Promise<{ organizationId: string } | null>; loadSession(sealedSession: string): Promise<ProviderSession> }
