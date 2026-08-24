# WorkOS AuthKit Custom Authentication Design

**Date:** 2026-08-23

**Status:** Approved for implementation
**Scope:** `apps/web`, the API's existing generic OIDC boundary, documentation, and tests

## Objective

Make WorkOS AuthKit the production identity provider while keeping every sign-in,
sign-up, recovery, verification, and challenge screen inside the Next.js application.
The Next.js server is the authentication backend-for-frontend (BFF): it owns WorkOS
API calls, trusted request context, encrypted session cookies, and session refresh.
The NestJS API remains a resource server that validates short-lived WorkOS access
tokens and applies the application's PostgreSQL-backed authorization rules.

The implementation must let a new company start locally without WorkOS credentials,
configure WorkOS for production without changing application code, and later replace
WorkOS through the existing OIDC boundary without redesigning organizations, projects,
roles, or permissions.

## Settled Decisions

- Production identity is provided by WorkOS AuthKit.
- The hosted AuthKit user interface is not used.
- All authentication UI is implemented in Next.js.
- Passkeys are explicitly excluded because WorkOS currently limits them to hosted UI.
- Vercel-hosted Next.js Server Actions and Route Handlers call WorkOS directly.
- Browser-supplied IP fields are never trusted. Server code reads the client IP from
  Vercel-controlled request headers and reads the user agent from the request.
- Radar context consists of the trusted client IP, user agent, and the opaque
  `@workos/radar-signals` correlation token supplied by the browser.
- WorkOS owns credentials, authentication factors, identity linking, access tokens,
  refresh tokens, and risk decisions.
- PostgreSQL owns durable application users, organizations, projects, memberships,
  roles, permissions, API keys, and audit records.
- WorkOS organization roles and token permissions never authorize application data.
- The public landing page remains `/`; all authenticated product pages move under
  `/app` so one route subtree can be protected consistently.
- WorkOS transactional emails are used initially. Replacing them with application
  emails is outside this implementation but must remain possible.
- Existing application invitation semantics remain authoritative. WorkOS invitations
  do not replace organization or project memberships in PostgreSQL.

## Alternatives Considered

### Selected: Next.js authentication BFF

The browser submits authentication forms to same-origin Server Actions. Next.js sends
credentials and trusted request context to WorkOS, seals the resulting WorkOS session
in an HttpOnly cookie, and forwards only the short-lived access token to NestJS.

This keeps the WorkOS API key and refresh token out of browser code, avoids forwarding
an alleged client IP through the public AWS API, and fits the existing server-to-server
API client.

### Rejected: NestJS authentication gateway

This would send credentials from Vercel to AWS and require a proxy trust contract for
the client IP. It would duplicate the web session boundary and make Radar context less
direct. NestJS should remain concerned with application APIs, not browser login state.

### Rejected: browser-to-WorkOS authentication

WorkOS supports public-client patterns, but a browser-first integration would move
more state and token handling into JavaScript and make the template's server-managed
session model harder to reason about. The BFF model provides a smaller credential and
refresh-token exposure surface.

## Trust Boundaries

```text
Untrusted browser
  | form fields + opaque Radar signals token
  v
Trusted Next.js server on Vercel
  | server-only WorkOS API key
  | Vercel-controlled client IP + request user agent
  v
WorkOS AuthKit and Radar
  | access token + refresh token + verified user
  v
Encrypted Secure HttpOnly session cookie
  | short-lived bearer access token only
  v
NestJS API on AWS
  | validated WorkOS signature, issuer, client ID, expiry
  v
PostgreSQL authorization and row-level security
```

The following rules are mandatory:

- No Server Action accepts `ipAddress`, `userAgent`, `returnTo`, pending tokens, or
  session tokens as trusted form values.
- `returnTo` is restricted to an application-relative allow-listed path and defaults
  to `/app`; absolute and protocol-relative URLs are rejected.
- WorkOS API keys, cookie passwords, access tokens, refresh tokens, OAuth code
  verifiers, pending authentication tokens, challenge identifiers, reset tokens, and
  raw passwords are never logged.
- Authentication errors returned to the browser are mapped to stable application
  codes and generic copy. Raw WorkOS response bodies are never rendered.
- Same-origin Server Action protection remains enabled; no additional allowed origins
  are configured for authentication actions.

## Web Authentication Architecture

### Module boundaries

Authentication code lives under `apps/web/src/auth` and is split by ownership:

- `config`: parses and validates local versus WorkOS mode without requiring secrets
  during a local/CI build.
- `workos`: constructs the server-only WorkOS client behind a narrow provider port.
- `request-context`: extracts the Vercel-controlled client IP and request user agent.
- `flow-state`: encrypts short-lived OAuth PKCE and challenge state in an HttpOnly
  cookie; pending tokens are never placed in URLs, client JavaScript, or hidden fields.
- `session`: creates, authenticates, refreshes, and clears the WorkOS sealed-session
  cookie using supported WorkOS SDK session helpers.
- `actions`: implements password, signup, verification, Magic Auth, MFA, Radar, and
  logout operations as Server Actions.
- `oauth`: creates social/SSO authorization redirects with PKCE and validates callback
  state before exchanging an authorization code.
- `errors`: converts WorkOS failures into a discriminated application result without
  leaking account existence or provider internals.
- `radar`: exposes the small client component that obtains a WorkOS signals token and
  supplies only that opaque token with auth form submissions.

All WorkOS calls pass through the provider port. Tests use a deterministic fake of the
port and never call WorkOS over the network.

### Authentication mode

The web application supports two explicit modes:

- `local`: development and CI only. Existing `API_AUTH_TOKEN` behavior remains and the
  protected `/app` subtree is accessible without WorkOS.
- `workos`: production mode. WorkOS client ID, API key, cookie password, redirect URI,
  session cookie settings, and API OIDC values must be complete.

Production fails closed if local mode is selected or WorkOS configuration is partial.
WorkOS modules are initialized lazily so `next build` does not perform network calls.

### Cookies

Two cookies are used:

1. A WorkOS sealed-session cookie containing the WorkOS session material. It is
   `HttpOnly`, `Secure` in production, `SameSite=Lax`, scoped to `/`, and has no parent
   domain by default. Its refresh token is never exposed separately.
2. A short-lived encrypted flow cookie for PKCE state, code verifier, intended return
   path, and one active verification/MFA/Radar challenge. It has the same security
   flags, a maximum age no longer than the WorkOS challenge window, and is cleared on
   completion, cancellation, mismatch, or terminal failure.

Cookie encryption keys come from a high-entropy `WORKOS_COOKIE_PASSWORD` of at least
32 characters. Authentication state is never stored in local storage or readable
browser cookies.

### Protected routing and refresh

Next.js `proxy.ts` protects `/app/:path*`. It authenticates the sealed WorkOS session,
applies any refreshed cookie headers, and redirects unauthenticated users to the
custom `/sign-in` page with a validated relative return path. Public landing and auth
routes remain accessible without a session. Authenticated users visiting sign-in or
sign-up are redirected to `/app`.

Access-token refresh uses the WorkOS sealed-session helper and rotated refresh token.
Concurrent refreshes must not overwrite a newer cookie with stale session data.
Terminal refresh failures clear the session and redirect to sign-in. Retryable WorkOS
failures return a temporary 503 and preserve the sealed cookie for a later request.

The server-side API client loads the authenticated session and forwards only its
current access token as `Authorization: Bearer ...`. `API_AUTH_TOKEN` remains a local
mode escape hatch and is forbidden as a production WorkOS substitute.

## User-Facing Flows

### Email and password sign-up

`/sign-up` collects email, password, and optional first/last name. The Server Action
normalizes the email, obtains trusted request context, passes Radar signals, and asks
WorkOS to create the user. Whether creation succeeds or the email already exists, the
action sends a Magic Auth code when possible and moves to the same custom email-code
screen with only encrypted flow state. This common continuation prevents the route,
copy, and UI state from revealing account existence. The password remains available
for later password sign-in; the initial email code proves address control and
establishes the sealed session.

### Email and password sign-in

`/sign-in` sends credentials, trusted IP, user agent, and optional Radar signals to
WorkOS. Successful authentication seals the session and redirects to the validated
return path. Invalid credentials use one generic error. Email verification, MFA,
organization selection, and Radar challenge responses transition to the corresponding
custom step with all pending state kept server-side.

### Email verification

`/verify-email` accepts only the one-time code. The pending authentication token and
email remain in encrypted flow state. The action completes the WorkOS verification
grant and establishes a session or transitions to another required challenge. Users
can request a new code through a rate-limited action without learning whether an
unrelated account exists.

### Magic Auth

The sign-in page can start Magic Auth for an email. WorkOS sends the branded code email
and the application shows a custom code form. Email, Radar attempt identifier, and
pending state stay in the encrypted flow cookie. A valid code establishes the normal
sealed session.

### Password reset

`/forgot-password` always returns the same confirmation regardless of account
existence. WorkOS sends the reset email. `/reset-password` reads the WorkOS reset token
from the initial URL, immediately moves it into encrypted short-lived flow state, and
redirects to a clean URL before accepting a new password. Successful reset returns the
user to sign-in without exposing the token.

### Social OAuth

The sign-in and sign-up pages render only providers enabled through validated server
configuration. Each provider initiation uses a Route Handler, WorkOS authorization
URL, PKCE, a cryptographically random state value, trusted Radar context where
supported, and an encrypted flow cookie. The callback requires an exact state match,
exchanges the code server-side, seals the session, and redirects to a validated
relative path.

The initial template supports WorkOS provider identifiers for Google, Microsoft,
GitHub, and Apple through configuration; no provider button appears merely because a
string was supplied by a browser.

### Enterprise SSO

The custom SSO form accepts a work email. Server code normalizes its domain and resolves
an unambiguous WorkOS organization/connection through the WorkOS API; raw WorkOS
organization or connection IDs are never accepted from the browser. It then starts the
same PKCE-protected callback flow. WorkOS organizations/connections are identity
configuration only and do not create application memberships or confer PostgreSQL
permissions.

If no unambiguous SSO route exists, the UI returns generic guidance to use another
configured method or contact an administrator.

### TOTP MFA

When WorkOS requires MFA enrollment, the app shows the QR code and manual secret only
on the custom enrollment page, completes the initial challenge, and removes enrollment
material from flow state afterward. Existing MFA users see only the TOTP code form.
Invalid and expired challenges return safe errors and require restarting sign-in when
WorkOS no longer considers the pending authentication valid.

### Radar challenges

The client-side `@workos/radar-signals` collector supplies an opaque signal ID. Every
supported create/authenticate/callback operation also sends the Vercel client IP and
user agent. Radar block responses show generic denial copy. Radar email and SMS
challenge tokens/identifiers remain in encrypted flow state; the user supplies only
the received code and, for signup SMS challenges when required, the phone number.

Radar for headless User Management APIs is currently preview. The integration is
configuration-gated: authentication works without Radar enablement, and enabling it
requires no code changes. Production documentation instructs teams to begin in WorkOS
log mode, verify events, and then enable enforcement.

### Logout

Logout is a POST Server Action. It clears local cookies before redirecting through the
WorkOS logout URL when a session ID is available. Repeated logout is safe. No GET route
causes state-changing logout.

## API Identity and Provisioning

The NestJS API retains its generic OIDC/JWKS adapter. For WorkOS it is configured with:

- the exact WorkOS issuer shown in the environment;
- `https://api.workos.com/sso/jwks/<WORKOS_CLIENT_ID>` or the environment-specific
  JWKS URL;
- `AUTH_CLIENT_ID=<WORKOS_CLIENT_ID>` rather than trusting an absent audience.

Standard WorkOS access tokens do not include email. The WorkOS dashboard must configure
this JWT template:

```json
{
  "email": {{ user.email }},
  "email_verified": {{ user.email_verified }}
}
```

Those claims preserve the API's existing fail-closed first-login provisioning:

1. validate JWT signature, issuer, client ID, and expiration;
2. resolve `issuer + subject` to an existing external identity;
3. for a new identity, require both an email and `email_verified: true`;
4. create or reuse the durable application user by normalized email;
5. link the WorkOS subject to that user.

Provider permissions, WorkOS organization IDs, and WorkOS roles may be parsed for
diagnostics but never substitute for organization or project membership checks.

## Application Authorization and Invitations

No authorization tables move to WorkOS. Existing organization/project role guards and
PostgreSQL row-level security remain unchanged. A WorkOS-authenticated user can:

- create an application organization and become its owner;
- accept an existing application invitation when the verified WorkOS email matches;
- receive project access only through the application's project membership model.

WorkOS SSO JIT provisioning or WorkOS organization membership never automatically
grants access to an application organization. Synchronizing enterprise directory
membership into application membership is a separate future feature requiring an
explicit policy and audit design.

## UI Structure

The public landing page remains at `/`. Existing workspace pages move beneath `/app`:

```text
/
/sign-in
/sign-up
/forgot-password
/reset-password
/verify-email
/auth/challenge
/auth/callback
/app
/app/members
/app/billing
/app/api-keys
/app/audit
```

Auth pages use a shared layout and reusable accessible form components. They match the
existing visual system rather than introducing a second design language. Forms include
labels, autocomplete attributes, pending states, keyboard-visible focus, and an
`aria-live` error summary. Password values are never repopulated after a submission.

The landing-page primary action becomes sign-up and the secondary action becomes
sign-in. The application shell exposes the authenticated user's display name/email and
a POST-backed sign-out control.

## Configuration

`apps/web/.env.example` documents non-secret placeholders for:

- `WEB_AUTH_MODE=local|workos`
- `WORKOS_CLIENT_ID`
- `WORKOS_API_KEY`
- `WORKOS_COOKIE_PASSWORD`
- `WORKOS_REDIRECT_URI`
- optional session and flow cookie names
- enabled social provider allow-list
- Radar enablement and public client ID used by the signal collector
- existing `API_URL` and local-only `API_AUTH_TOKEN`

`apps/api/.env.example`, `apps/infra/.env.example`, and the root README document the
matching WorkOS OIDC issuer, JWKS URL, and client ID. Secrets are configured in Vercel;
the WorkOS API key and cookie password are not added to CDK or AWS. The API needs no
WorkOS API key.

The setup guide includes dashboard steps for redirect/logout URLs, authentication
methods, branded transactional emails, the JWT template, social providers, MFA, SSO,
Radar preview/log mode, and production custom domains.

## Error Handling

Application action results use stable codes such as:

- `invalid_credentials`
- `validation_error`
- `verification_required`
- `mfa_enrollment_required`
- `mfa_required`
- `radar_challenge_required`
- `authentication_blocked`
- `flow_expired`
- `service_unavailable`

Only validation errors safe to disclose are field-specific. Sign-in, recovery, Magic
Auth, SSO discovery, and resend operations do not reveal whether an account or domain
exists. Unexpected WorkOS failures are logged only with a request/correlation ID and a
safe provider error category, never request bodies or credentials.

Network and rate-limit errors produce retryable user feedback. Invalid/expired flow
cookies are deleted and restart authentication. OAuth callback errors validate state
before rendering generic failure copy. Session-refresh failures clear the cookie and
require a new sign-in.

## Testing Strategy

Implementation follows test-first development. Each production behavior begins with a
test that fails for the missing feature and then passes with the minimal implementation.

### Unit tests

- Configuration accepts complete local/WorkOS modes and rejects production local mode,
  short cookie secrets, partial WorkOS credentials, unknown providers, and unsafe URLs.
- Request-context extraction prefers Vercel-controlled IP headers and never accepts a
  form-supplied IP.
- Return paths reject absolute, protocol-relative, encoded, and cross-origin values.
- Flow-state encryption round-trips valid state, rejects tampering/expiry, and never
  serializes secrets into client-readable output.
- Provider error mapping covers credentials, verification, MFA enrollment/challenge,
  organization selection, Radar block/challenge, expiry, rate limits, and outages.
- Session creation, validation, refresh, rotation, clearing, and logout use secure
  cookie attributes.
- API bearer forwarding uses a current WorkOS access token in WorkOS mode and the fixed
  token only in local mode.

### Action and route tests

- Sign-up, sign-in, verification, Magic Auth, password reset, MFA, Radar, social OAuth,
  SSO, callback, refresh, and logout each cover success and important failure states.
- Tests assert the provider receives trusted request context and an optional signals
  ID but never receives a browser-supplied IP.
- OAuth/SSO tests prove PKCE and state validation and reject open redirects.
- Recovery and discovery tests prove responses do not disclose account/domain existence.
- Protected route tests prove `/app` redirects while `/`, auth pages, health, and static
  assets remain public.

### API tests

- Existing OIDC tests confirm WorkOS-style `client_id`, email, and verified-email claims
  produce the correct provider-neutral principal.
- First-time identity tests continue to reject missing/unverified email and link a
  verified WorkOS subject to a durable application user.
- Organization and project authorization tests remain unchanged and passing.

### Repository verification

Before handoff, run:

```bash
pnpm format:check
pnpm check
```

Run the relevant web/API tests uncached while developing. The final parent verification
also inspects generated OpenAPI/client artifacts, the exact diff, dependency scope, and
the production build with no WorkOS network calls.

## Out of Scope

- Passkeys until WorkOS supports them in custom AuthKit UIs.
- Custom delivery of WorkOS transactional emails.
- Replacing application organizations, roles, or permissions with WorkOS equivalents.
- Automatic WorkOS-directory-to-application-membership synchronization.
- Building enterprise SSO connection setup or Admin Portal UI.
- Persisting upstream social-provider OAuth tokens.
- A live production WorkOS environment, real provider credentials, or enabling preview
  Radar enforcement on behalf of the template user.

## Acceptance Criteria

The change is acceptable when:

1. The repository provides a complete custom WorkOS authentication UI for all in-scope
   methods and challenges without using hosted AuthKit pages.
2. All credential operations run on the Next.js server and use Vercel-derived IP/user
   agent context plus optional Radar signals.
3. WorkOS session and flow state are encrypted in secure HttpOnly cookies; no refresh,
   pending, reset, or PKCE secret is exposed to client JavaScript or URLs after capture.
4. `/app` is protected and all existing workspace routes function under that prefix.
5. NestJS validates WorkOS JWTs through the existing provider-neutral OIDC boundary and
   provisions only verified identities using the documented JWT template.
6. Application authorization remains exclusively database-backed.
7. Local development and CI work without WorkOS credentials; production fails closed
   on incomplete or local authentication configuration.
8. The WorkOS/Radar setup guide is sufficient for a new company to configure staging
   and production without reading implementation internals.
9. Focused tests, `pnpm format:check`, and the full uncached `pnpm check` pass.
