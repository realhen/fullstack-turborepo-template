# WorkOS AuthKit Custom Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fully custom WorkOS AuthKit authentication experience to the Next.js application while preserving PostgreSQL-backed authorization and the NestJS API's generic OIDC boundary.

**Architecture:** Next.js is the authentication BFF. Server Actions and Route Handlers call WorkOS with Vercel-derived request context, keep pending authentication state in encrypted cookies, seal WorkOS sessions in an HttpOnly cookie, and forward only a short-lived access token to NestJS. WorkOS owns authentication; the application database remains the only source of application roles and permissions.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 6, WorkOS Node SDK, WorkOS Radar Signals, JOSE, Zod, Vitest, NestJS, pnpm/Turborepo.

**Spec:** `docs/superpowers/specs/2026-08-23-workos-custom-auth-design.md`

## Global Constraints

- Do not use WorkOS hosted AuthKit screens or add passkeys.
- Do not trust browser-supplied IP addresses, user agents, pending tokens, WorkOS IDs, session material, or return URLs.
- Read client IP only from Vercel-controlled headers and preserve a missing value rather than inventing one.
- Keep the WorkOS API key, cookie password, refresh token, and pending authentication tokens server-only.
- Keep application authorization in PostgreSQL; do not map WorkOS roles or permissions into API authorization.
- Keep local and CI operation available without WorkOS credentials. Production must reject local mode, incomplete configuration, and weak cookie secrets.
- Use WorkOS transactional email. Do not implement production GitHub/CodePipeline work, custom email delivery, enterprise SSO administration, directory provisioning, or upstream OAuth token storage.
- Add no `TODO`, placeholder, mocked production path, or dead compatibility layer.
- Use tests to drive each behavioral unit. Run the focused failing test before implementation and the focused passing test after it.
- Commit each completed task. Do not modify the approved spec except to correct a discovered contradiction, which must be reported.

---

## Task 1: Pin dependencies and validate authentication configuration

**Files:**

- Modify: `pnpm-workspace.yaml`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/web/src/auth/config.ts`
- Create: `apps/web/src/auth/config.test.ts`
- Modify: `apps/web/.env.example`

**Interfaces:**

```ts
export type SocialProvider =
  'GoogleOAuth' | 'MicrosoftOAuth' | 'GitHubOAuth' | 'AppleOAuth'

export type WebAuthConfig =
  | { mode: 'local'; sessionCookieName: string }
  | {
      mode: 'workos'
      apiKey: string
      clientId: string
      cookiePassword: string
      redirectUri: string
      sessionCookieName: string
      flowCookieName: string
      socialProviders: readonly SocialProvider[]
      radarMode: 'off' | 'log' | 'enforce'
    }

export function getWebAuthConfig(env?: NodeJS.ProcessEnv): WebAuthConfig
```

- [ ] Add catalog pins for `@workos-inc/node@^10.10.0` and `@workos/radar-signals@^0.0.1`; consume them from `apps/web`, along with the existing catalogued `jose` dependency.
- [ ] Write tests proving that development/test can use explicit local mode without WorkOS secrets; a complete WorkOS configuration is accepted; and production local mode, partial credentials, a cookie password shorter than 32 characters, a non-HTTPS production redirect URI, an unknown provider, and an invalid Radar mode all fail closed.
- [ ] Run `pnpm --filter web test -- src/auth/config.test.ts` and confirm it fails because the module does not exist.
- [ ] Implement one cached server-only configuration parser using Zod. Treat an unset mode as local only outside production; never silently fall back from a partially configured WorkOS mode.
- [ ] Document every new variable in `apps/web/.env.example` without real values: `WEB_AUTH_MODE`, `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD`, `WORKOS_REDIRECT_URI`, `WORKOS_SOCIAL_PROVIDERS`, and `WORKOS_RADAR_MODE`.
- [ ] Run the focused test and `pnpm --filter web typecheck`.
- [ ] Commit: `feat(auth): validate WorkOS web configuration`

## Task 2: Derive trusted request context and constrain return paths

**Files:**

- Create: `apps/web/src/auth/request-context.ts`
- Create: `apps/web/src/auth/request-context.test.ts`
- Create: `apps/web/src/auth/return-path.ts`
- Create: `apps/web/src/auth/return-path.test.ts`

**Interfaces:**

```ts
export interface AuthRequestContext {
  ipAddress?: string
  userAgent?: string
}

export function requestContextFromHeaders(headers: Headers): AuthRequestContext
export function safeReturnPath(
  value: FormDataEntryValue | string | null | undefined,
): string
```

- [ ] Test that `x-vercel-forwarded-for` takes precedence, `x-forwarded-for` is the documented fallback, only the first syntactically valid address is accepted, and arbitrary client-IP headers are ignored. Test missing/blank user agents.
- [ ] Test that only `/app` and descendants such as `/app/members?tab=pending` are retained. Reject protocol-relative URLs, absolute URLs, encoded bypasses, backslashes, control characters, and unrelated paths; fall back to `/app`.
- [ ] Run both tests and confirm module-not-found failures.
- [ ] Implement pure parsers plus a small async wrapper around Next.js `headers()` for Server Actions and Route Handlers. Do not use a request body or form field for trusted context.
- [ ] Run focused tests and `pnpm --filter web typecheck`.
- [ ] Commit: `feat(auth): derive trusted request context`

## Task 3: Encrypt short-lived authentication flow state

**Files:**

- Create: `apps/web/src/auth/flow-state.ts`
- Create: `apps/web/src/auth/flow-state.test.ts`
- Create: `apps/web/src/auth/cookies.ts`
- Create: `apps/web/src/auth/cookies.test.ts`

**Interfaces:**

```ts
export type AuthFlowState =
  | {
      kind: 'email-verification'
      pendingAuthenticationToken: string
      returnTo: string
      expiresAt: number
    }
  | {
      kind: 'magic-auth'
      email: string
      radarAuthAttemptId?: string
      returnTo: string
      expiresAt: number
    }
  | {
      kind: 'mfa'
      pendingAuthenticationToken: string
      challengeId?: string
      returnTo: string
      expiresAt: number
    }
  | {
      kind: 'radar-email'
      pendingAuthenticationToken: string
      challengeId: string
      returnTo: string
      expiresAt: number
    }
  | {
      kind: 'radar-sms'
      pendingAuthenticationToken: string
      challengeId: string
      returnTo: string
      expiresAt: number
    }
  | {
      kind: 'oauth'
      state: string
      codeVerifier: string
      signalsId?: string
      returnTo: string
      expiresAt: number
    }
  | { kind: 'password-reset'; token: string; expiresAt: number }

export interface FlowStateCodec {
  seal(state: AuthFlowState): Promise<string>
  unseal(
    value: string,
    expectedKind?: AuthFlowState['kind'],
  ): Promise<AuthFlowState>
}
```

- [ ] Test round trips for every variant, authenticated-encryption tamper rejection, expiry rejection, wrong-kind rejection, and absence of plaintext pending tokens in the compact cookie value.
- [ ] Test session and flow cookie options: HttpOnly, SameSite=Lax, path `/`, Secure in production, host-only by default, bounded flow max-age, and deletion with matching attributes.
- [ ] Run focused tests and confirm failure.
- [ ] Implement `dir`/`A256GCM` JWE with a SHA-256-derived key, fixed issuer/audience, authenticated `kind`, and injected clock support for deterministic tests. Validate the decrypted payload with Zod before returning it.
- [ ] Implement centralized cookie names/options so Actions, Route Handlers, and proxy cannot drift.
- [ ] Run focused tests and typecheck.
- [ ] Commit: `feat(auth): protect pending authentication state`

## Task 4: Define the provider boundary and implement WorkOS mapping

**Files:**

- Create: `apps/web/src/auth/provider.ts`
- Create: `apps/web/src/auth/workos-provider.ts`
- Create: `apps/web/src/auth/workos-provider.test.ts`
- Create: `apps/web/src/auth/provider-errors.ts`
- Create: `apps/web/src/auth/provider-errors.test.ts`

**Interfaces:**

```ts
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
      status: 'mfa-required'
      pendingAuthenticationToken: string
      factors: readonly MfaFactor[]
    }
  | {
      status: 'radar-challenge'
      pendingAuthenticationToken: string
      challenge: RadarChallenge
    }
  | { status: 'blocked' }

export interface AuthenticationProvider {
  signUp(input: PasswordSignUpInput): Promise<AuthenticationOutcome>
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
  authenticateTotp(input: TotpChallengeInput): Promise<AuthenticationOutcome>
  startRadarChallenge(
    input: RadarChallengeStartInput,
  ): Promise<RadarChallengeStartResult>
  completeRadarChallenge(
    input: RadarChallengeCompleteInput,
  ): Promise<AuthenticationOutcome>
  authorizationUrl(input: AuthorizationUrlInput): Promise<string>
  exchangeAuthorizationCode(
    input: AuthorizationCodeInput,
  ): Promise<AuthenticationOutcome>
  resolveSsoOrganization(
    email: string,
  ): Promise<{ organizationId: string } | null>
  loadSession(sealedSession: string): Promise<ProviderSession>
}
```

- [ ] Write adapter tests with an injected WorkOS client double. Cover exact field mapping for trusted IP, user agent, opaque `signalsId`, Radar mode, PKCE, provider/organization authorization selection, session creation, and all discriminated WorkOS response outcomes.
- [ ] Test error normalization separately. Public results must not reveal whether an account exists; unexpected/provider-configuration errors must remain distinguishable for server logging without reaching form state.
- [ ] Run focused tests and confirm failure.
- [ ] Inspect the installed WorkOS 10.10 TypeScript declarations before implementing. Keep SDK-specific response types inside this adapter; expose only the application port above.
- [ ] Build sealed sessions with the WorkOS SDK's current session API. Do not reimplement refresh-token sealing and do not call removed pre-v8 helpers.
- [ ] Run focused tests and typecheck.
- [ ] Commit: `feat(auth): add WorkOS authentication provider`

## Task 5: Load, refresh, and forward authenticated sessions

**Files:**

- Create: `apps/web/src/auth/session.ts`
- Create: `apps/web/src/auth/session.test.ts`
- Modify: `apps/web/src/lib/saas-api.ts`
- Create: `apps/web/src/lib/saas-api.test.ts`

**Interfaces:**

```ts
export type SessionAuthentication =
  | {
      authenticated: true
      user: AuthenticatedUser
      accessToken: string
      replacementCookie?: string
    }
  | { authenticated: false; clearCookie: boolean }

export async function authenticateWebSession(
  input: SessionInput,
): Promise<SessionAuthentication>
export async function currentApiAuthorization(): Promise<string | undefined>
```

- [ ] Test a valid sealed session, an expired access token successfully refreshed by WorkOS, a failed refresh that clears the cookie, tampered session data, and local mode behavior.
- [ ] Test that `saas-api.ts` forwards a bearer token derived from the authenticated server session, never exposes the refresh token, and retains `API_AUTH_TOKEN` only for explicit non-production local mode.
- [ ] Run focused tests and confirm failure.
- [ ] Implement session loading through the provider boundary, using the SDK session object's `authenticate()` and `refresh()` behavior. Persist a replacement sealed cookie after refresh and delete invalid cookies with matching attributes.
- [ ] Replace the old independently named access-token cookie path in `saas-api.ts`.
- [ ] Run focused tests and typecheck.
- [ ] Commit: `feat(auth): manage WorkOS web sessions`

## Task 6: Protect `/app` and relocate authenticated routes

**Files:**

- Create: `apps/web/src/proxy.ts`
- Create: `apps/web/src/proxy.test.ts`
- Move: `apps/web/src/app/(saas)/page.tsx` to `apps/web/src/app/(saas)/app/page.tsx`
- Move: `apps/web/src/app/(saas)/members/page.tsx` to `apps/web/src/app/(saas)/app/members/page.tsx`
- Move: `apps/web/src/app/(saas)/billing/page.tsx` to `apps/web/src/app/(saas)/app/billing/page.tsx`
- Move: `apps/web/src/app/(saas)/api-keys/page.tsx` to `apps/web/src/app/(saas)/app/api-keys/page.tsx`
- Move: `apps/web/src/app/(saas)/audit/page.tsx` to `apps/web/src/app/(saas)/app/audit/page.tsx`
- Modify: `apps/web/src/app/(saas)/layout.tsx`
- Modify: `apps/web/src/components/saas-shell.tsx`
- Modify: `apps/web/src/app/page.tsx`

**Interfaces:**

```ts
export function requiresAuthentication(pathname: string): boolean
export const config = { matcher: ['/app/:path*'] }
```

- [ ] Test the proxy matcher with Next's experimental proxy test helper and a pure route policy. `/app` and descendants must match; landing and all auth pages must not.
- [ ] Test unauthenticated redirect to `/sign-in?returnTo=...`, safe preservation of path/query, successful refresh cookie propagation, invalid-cookie deletion, and explicit local-mode bypass.
- [ ] Run the proxy test and confirm failure.
- [ ] Implement lightweight session validation/refresh in `proxy.ts`; do not call the NestJS API there.
- [ ] Move all product pages under `/app`, remove the existing duplicate `/` route, update every shell link and active-link comparison, keep the marketing page at `/`, and add sign-in/app calls to action.
- [ ] Render the authenticated user and POST-backed sign-out control in the SaaS shell without adding client-side token state.
- [ ] Run focused tests, typecheck, and `pnpm --filter web build`.
- [ ] Commit: `feat(auth): protect the application route tree`

## Task 7: Build shared custom authentication UI and Radar signals

**Files:**

- Create: `apps/web/src/app/(auth)/layout.tsx`
- Create: `apps/web/src/components/auth/auth-card.tsx`
- Create: `apps/web/src/components/auth/auth-field.tsx`
- Create: `apps/web/src/components/auth/auth-submit.tsx`
- Create: `apps/web/src/components/auth/radar-signals.tsx`
- Create: `apps/web/src/auth/action-state.ts`
- Create: `apps/web/src/auth/action-state.test.ts`

- [ ] Test the public error mapper: validation errors are field-specific, invalid credentials are generic, account lookup is non-enumerating, block/challenge states are actionable, and unexpected errors produce a stable generic message plus a server-loggable cause.
- [ ] Run the test and confirm failure.
- [ ] Implement accessible server-rendered auth scaffolding, reusable labeled fields, pending submit feedback, and `aria-live` form errors. Keep client components limited to form pending state and Radar signal collection.
- [ ] Integrate `@workos/radar-signals` only when WorkOS mode and Radar are enabled. Submit only its opaque `signals_id`; never submit or infer the client IP in JavaScript.
- [ ] Run focused tests, lint, and typecheck.
- [ ] Commit: `feat(auth): add custom authentication UI primitives`

## Task 8: Implement password, sign-up, and email-verification flows

**Files:**

- Create: `apps/web/src/auth/password-service.ts`
- Create: `apps/web/src/auth/password-service.test.ts`
- Create: `apps/web/src/auth/actions/password.ts`
- Create: `apps/web/src/app/(auth)/sign-in/page.tsx`
- Create: `apps/web/src/app/(auth)/sign-up/page.tsx`
- Create: `apps/web/src/app/(auth)/verify-email/page.tsx`

- [ ] Test sign-up and password sign-in with an `AuthenticationProvider` fake. Assert server-derived request context, Radar signals passthrough, safe `returnTo`, generic credential errors, session-cookie success, verification-state persistence, and redirect only after the cookie write.
- [ ] Test verification with correct, invalid, and expired pending flow state. The browser may provide the code but never the pending authentication token.
- [ ] Run the focused service tests and confirm failure.
- [ ] Implement pure orchestration services first, then thin `'use server'` wrappers that parse FormData with Zod, read trusted context/cookies, write sealed cookies, and call `redirect()` only at the boundary.
- [ ] Build fully custom sign-in, sign-up, and verification pages, including navigation to Magic Auth and password recovery.
- [ ] Run focused tests, lint, typecheck, and build.
- [ ] Commit: `feat(auth): add password authentication flows`

## Task 9: Implement Magic Auth and password recovery

**Files:**

- Create: `apps/web/src/auth/recovery-service.ts`
- Create: `apps/web/src/auth/recovery-service.test.ts`
- Create: `apps/web/src/auth/actions/recovery.ts`
- Create: `apps/web/src/app/(auth)/magic-auth/page.tsx`
- Create: `apps/web/src/app/(auth)/forgot-password/page.tsx`
- Create: `apps/web/src/app/(auth)/reset-password/route.ts`
- Create: `apps/web/src/app/(auth)/reset-password/new/page.tsx`

- [ ] Test Magic Auth start/completion, generic account-independent start response, trusted context propagation, encrypted attempt state, wrong/expired code behavior, and session success.
- [ ] Test password reset start with identical public behavior for known/unknown accounts. Test that the one-time URL token is captured into encrypted flow state and immediately redirected to a clean URL, then is read from the cookie rather than posted back by the browser.
- [ ] Run focused tests and confirm failure.
- [ ] Implement services, thin server wrappers, and custom pages. Never log email codes, reset tokens, or pending tokens.
- [ ] Run focused tests, lint, typecheck, and build.
- [ ] Commit: `feat(auth): add passwordless and recovery flows`

## Task 10: Implement TOTP MFA and Radar challenges

**Files:**

- Create: `apps/web/src/auth/challenge-service.ts`
- Create: `apps/web/src/auth/challenge-service.test.ts`
- Create: `apps/web/src/auth/actions/challenge.ts`
- Create: `apps/web/src/app/(auth)/auth/challenge/page.tsx`

- [ ] Test existing TOTP challenge, TOTP enrollment, invalid code, Radar block, Radar email challenge, and Radar SMS challenge. Assert all pending tokens and challenge IDs come from encrypted flow state; only codes, a phone number where required, and opaque Radar signals come from the form.
- [ ] Test that `WORKOS_RADAR_MODE=log` records but does not enforce decisions and `enforce` follows block/challenge outcomes. Test disabled mode omits Radar fields.
- [ ] Run the focused test and confirm failure.
- [ ] Implement the discriminated challenge service and one server-rendered challenge page that selects the correct custom form from flow state. Keep phone input validation conservative and normalize to E.164 before provider calls.
- [ ] Run focused tests, lint, typecheck, and build.
- [ ] Commit: `feat(auth): add MFA and Radar challenge flows`

## Task 11: Implement social OAuth and enterprise SSO callbacks

**Files:**

- Create: `apps/web/src/auth/oauth-service.ts`
- Create: `apps/web/src/auth/oauth-service.test.ts`
- Create: `apps/web/src/app/auth/oauth/[provider]/route.ts`
- Create: `apps/web/src/app/auth/sso/route.ts`
- Create: `apps/web/src/app/auth/callback/route.ts`

- [ ] Test allowlisted social provider selection, random state and PKCE verifier creation, encrypted callback state, exact state comparison, one-time state consumption, authorization-code exchange, safe return redirect, callback error cleanup, and replay rejection.
- [ ] Test enterprise SSO lookup from a validated work email. Only an unambiguous server-resolved WorkOS organization may be passed to authorization; a raw organization or connection ID from the browser is rejected/ignored.
- [ ] Run focused tests and confirm failure.
- [ ] Implement framework-independent orchestration plus thin Route Handlers. Preserve opaque Radar signals in encrypted OAuth state when present. The callback may accept `code`, `state`, and documented error fields only.
- [ ] Expose configured social buttons and an enterprise SSO email form on the custom sign-in page.
- [ ] Run focused tests, lint, typecheck, and build.
- [ ] Commit: `feat(auth): add social and enterprise sign-in`

## Task 12: Implement logout and authenticated user presentation

**Files:**

- Create: `apps/web/src/auth/logout-service.ts`
- Create: `apps/web/src/auth/logout-service.test.ts`
- Create: `apps/web/src/auth/actions/logout.ts`
- Create: `apps/web/src/auth/current-user.ts`
- Modify: `apps/web/src/app/(saas)/layout.tsx`
- Modify: `apps/web/src/components/saas-shell.tsx`

- [ ] Test logout as a POST-backed action, local cookie deletion, WorkOS logout URL generation, safe post-logout return, invalid session handling, and matching cookie-deletion attributes.
- [ ] Run the focused test and confirm failure.
- [ ] Implement logout without a GET mutation. Resolve current user on the server, pass display-only data to the client shell, and never serialize tokens or sealed session data into React props.
- [ ] Run focused tests, lint, typecheck, and build.
- [ ] Commit: `feat(auth): complete authenticated session UX`

## Task 13: Preserve generic API authorization and document WorkOS setup

**Files:**

- Modify: `apps/api/src/auth/infrastructure/authentication.adapter.spec.ts`
- Modify: `apps/api/.env.example`
- Modify: `apps/infra/.env.example`
- Modify: `README.md`
- Create: `docs/workos-authkit.md`

- [ ] Add an API regression test using a WorkOS-shaped access token with `sub`, custom `email`, and custom `email_verified`. Prove first-login identity provisioning still requires a verified email and that neither WorkOS roles nor token permissions grant application authorization.
- [ ] Run the focused API tests before changes and record whether the added case fails for a test-fixture reason or already passes by design.
- [ ] Make only the minimal generic-OIDC implementation adjustment if the regression test exposes a real incompatibility. Do not add the WorkOS SDK or API key to NestJS or CDK.
- [ ] Document dashboard setup: redirect/logout URLs, social connections, enterprise connections, TOTP, WorkOS email templates, the required JWT template claims, API OIDC issuer/JWKS/client ID values, Radar preview enablement, `log` before `enforce`, Vercel environment variables, local mode, and the absence of passkeys/hosted UI.
- [ ] Document the exact JWT template:

```json
{
  "email": {{ user.email }},
  "email_verified": {{ user.email_verified }}
}
```

- [ ] Run focused API/web tests and typechecks.
- [ ] Commit: `docs(auth): document WorkOS AuthKit setup`

## Task 14: Complete repository verification and handoff

**Files:**

- Modify only files needed to correct verification failures introduced by this branch.

- [ ] Run `pnpm format` and inspect the diff for semantic changes.
- [ ] Run all new focused web authentication tests together.
- [ ] Run `pnpm --filter api test` and `pnpm --filter web test`.
- [ ] Run `pnpm format:check`.
- [ ] Run the full local CI equivalent without Turbo cache: `TURBO_FORCE=true pnpm check`.
- [ ] Search changed files for `TODO`, placeholders, hosted AuthKit UI usage, passkeys, leaked secrets, client-IP form fields, client-side token storage, and WorkOS authorization coupling.
- [ ] Inspect `git diff --check`, the complete branch diff, and `git status --short`.
- [ ] Commit any verification-only fixes as `fix(auth): resolve authentication verification findings`.
- [ ] Submit the verified diff to an independent read-only security-focused review. Resolve every valid fix-first finding and rerun affected focused tests plus the full uncached check.
- [ ] Push the feature branch, open a pull request targeting `main`, wait for required checks, and report the exact PR URL and merge readiness. Do not merge unless separately authorized.
