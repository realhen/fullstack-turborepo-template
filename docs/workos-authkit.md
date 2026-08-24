# WorkOS AuthKit setup

This repository uses WorkOS as a production identity provider through a custom
Next.js authentication UI. The hosted AuthKit pages are not used. The Next.js
server is the authentication backend-for-frontend (BFF): it calls WorkOS,
keeps pending state in encrypted cookies, creates the WorkOS sealed session,
and forwards only a short-lived access token to the NestJS API.

The API remains provider-neutral. It validates an OIDC/JWKS access token and
uses PostgreSQL application users, organizations, projects, memberships, roles,
and permissions for authorization. WorkOS organization roles, organization IDs,
and token permissions never grant application data access by themselves.

## Configuration ownership

Keep configuration in the environment that owns the trust boundary:

| Variable                       | Where it belongs                                   | Purpose                                                                                                                |
| ------------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `WORKOS_API_KEY`               | Vercel server environment only                     | Server-to-server WorkOS User Management and OAuth calls.                                                               |
| `WORKOS_CLIENT_ID`             | Vercel server environment                          | WorkOS project/client selected by the server.                                                                          |
| `WORKOS_COOKIE_PASSWORD`       | Vercel server environment only                     | Generate with `openssl rand -base64 48`; at least 32 high-entropy characters, never placeholders or repeated material. |
| `WORKOS_REDIRECT_URI`          | Vercel server environment                          | The registered callback URL, normally `https://app.example.com/auth/callback`.                                         |
| `WORKOS_SESSION_COOKIE_NAME`   | Vercel server environment                          | Optional legal HTTP cookie name; defaults to `saas_session`; must differ from the flow name.                           |
| `WORKOS_FLOW_COOKIE_NAME`      | Vercel server environment                          | Optional legal HTTP cookie name; defaults to `saas_auth_flow`; must differ from session.                               |
| `WORKOS_SOCIAL_PROVIDERS`      | Vercel server environment                          | Comma-separated allow-list of `GoogleOAuth`, `MicrosoftOAuth`, `GitHubOAuth`, and `AppleOAuth`.                        |
| `WORKOS_RADAR_MODE`            | Vercel server environment                          | `off`, `log`, or `enforce`; start with `off` or `log`.                                                                 |
| `NEXT_PUBLIC_WORKOS_CLIENT_ID` | Vercel browser-visible environment, only for Radar | Required for `log`/`enforce` and must exactly equal `WORKOS_CLIENT_ID`; it is not a secret.                            |
| `AUTH_MODE`                    | API runtime                                        | Set to `oidc` for a deployed API.                                                                                      |
| `AUTH_ISSUER`                  | API runtime and CDK context                        | Exact issuer for the WorkOS environment.                                                                               |
| `AUTH_JWKS_URI`                | API runtime and CDK context                        | WorkOS JWKS endpoint for the client/environment.                                                                       |
| `AUTH_CLIENT_ID`               | API runtime and CDK context                        | WorkOS client ID; use this when WorkOS access tokens do not have a usable audience.                                    |
| `AUTH_AUDIENCE`                | API runtime and CDK context, optional              | Audience claim required by the generic OIDC adapter when the provider uses one.                                        |

The API does not receive `WORKOS_API_KEY`, `WORKOS_COOKIE_PASSWORD`, refresh
tokens, or the web session cookie. Do not add those values to NestJS, CDK
context, AWS Secrets Manager bindings, browser code, or a committed `.env`
file. The examples in `apps/web/.env.example`, `apps/api/.env.example`, and
`apps/infra/.env.example` are the source of the variable names.

## WorkOS dashboard checklist

Use separate WorkOS environments/projects for local-adjacent staging and
production. Complete the following in each environment before deploying the
matching Vercel/API configuration.

### Application URLs

Register the exact HTTPS callback URL in the WorkOS authentication/OAuth
configuration:

```text
https://app.example.com/auth/callback
```

Register the local or preview callback only in a non-production environment,
for example:

```text
http://localhost:3000/auth/callback
https://staging.example.com/auth/callback
```

Configure the allowed logout return origin/URL for the same application. The
server constructs a safe return URL from the configured redirect URI origin and
an application-relative path; the usual production value is:

```text
https://app.example.com/
```

Keep redirect and logout URLs exact per environment. Do not use a wildcard,
an untrusted request parameter, or a URL that crosses to another origin.

### Social connections

Enable and configure only the social connections that the application should
offer. The provider names in `WORKOS_SOCIAL_PROVIDERS` must be an exact subset
of:

```text
GoogleOAuth,MicrosoftOAuth,GitHubOAuth,AppleOAuth
```

Complete each provider's WorkOS setup and its provider-console callback/client
configuration. A social button is rendered only when the server-side
allow-list contains that provider. OAuth state and PKCE verifier material stay
in the encrypted flow cookie; they are never accepted from a browser form or
stored in local storage.

### Enterprise connections

Create the SAML/OIDC enterprise connections and associate their verified domains
with the appropriate WorkOS organizations. The custom SSO form accepts a work
email; the server resolves an unambiguous WorkOS connection before starting
OAuth. It never trusts a raw organization ID or connection ID from the browser.

WorkOS enterprise organization membership is identity configuration only. It
does not create an application organization, membership, project role, or
PostgreSQL permission. Those remain application workflows.

### TOTP and email delivery

Enable TOTP/MFA in User Management for the environment. The application renders
the custom enrollment and challenge forms, including the QR/manual secret only
for the enrollment transition. Users with an existing factor submit only the
one-time code. Do not enable or document passkeys for this custom UI; passkeys
are outside this implementation.

Review and brand the WorkOS transactional email templates used for:

- email verification;
- Magic Auth codes;
- password recovery/reset;
- MFA and Radar challenge messages where enabled.

Keep links and expiry wording consistent with the custom routes in this
application. Custom email delivery is intentionally not part of this setup;
WorkOS transactional email is the initial delivery mechanism.

## Required JWT template

WorkOS access tokens do not reliably include the email claims needed for safe
first-login provisioning. Add the following custom claims to the access-token
JWT template exactly as shown:

```json
{
  "email": {{ user.email }},
  "email_verified": {{ user.email_verified }}
}
```

The standard `iss`, `sub`, `client_id`, expiry, and signature claims remain
provided by WorkOS. Do not copy a browser-supplied email into an API request.
The API accepts a new external identity only when the verified token contains a
non-empty email and `email_verified: true`; an existing issuer-plus-subject
link is resolved first.

Roles and permissions from WorkOS may be present for provider diagnostics and
provider-neutral scopes, but they are not application authorization. The API
does not map a WorkOS role to an application role. Organization and project
guards consult PostgreSQL membership/permission records, and row-level
security remains the second tenant boundary.

## API OIDC configuration

Set the API environment to the generic OIDC adapter:

```dotenv
AUTH_MODE=oidc
AUTH_ISSUER=https://issuer-from-the-workos-environment.example/
AUTH_JWKS_URI=https://api.workos.com/sso/jwks/<WORKOS_CLIENT_ID>
AUTH_CLIENT_ID=<WORKOS_CLIENT_ID>
# AUTH_AUDIENCE=your-api-audience
```

Use the exact issuer and JWKS URI shown for the WorkOS environment. The
`https://api.workos.com/sso/jwks/<WORKOS_CLIENT_ID>` form is the usual WorkOS
SSO JWKS endpoint; use the environment-specific endpoint when WorkOS provides
one. Set `AUTH_CLIENT_ID` to the same WorkOS client ID used by the web app.
`AUTH_AUDIENCE` is optional and should be set only when the token's audience is
an intentional API contract. The adapter validates the JWT signature, issuer,
expiry, and configured audience/client ID before producing a provider-neutral
principal.

For AWS/CDK, pass only the generic context values. For example:

```bash
pnpm --filter @repo/infra exec cdk deploy api-stack \
  -c domainName=api.example.com \
  -c webOrigin=https://app.example.com \
  -c authIssuer=https://issuer-from-the-workos-environment.example/ \
  -c authJwksUri=https://api.workos.com/sso/jwks/<WORKOS_CLIENT_ID> \
  -c authClientId=<WORKOS_CLIENT_ID>
```

Do not pass `WORKOS_API_KEY`, `WORKOS_COOKIE_PASSWORD`, a session cookie, or a
refresh token to CDK or the API. A partial OIDC configuration fails closed at
startup rather than silently running with disabled authentication.

## Radar Signals rollout

Radar Signals for the headless User Management API is a preview capability.
Enable the preview in the WorkOS dashboard for the non-production environment
first. The browser collector is enabled only when all of the following are
true:

1. `WEB_AUTH_MODE=workos`;
2. `WORKOS_RADAR_MODE` is `log` or `enforce`; and
3. `NEXT_PUBLIC_WORKOS_CLIENT_ID` is set.

The collector sends only its opaque signal/correlation ID. The server derives
the client IP from trusted Vercel request headers and reads the request user
agent; no form field may supply either value. Radar block/challenge details,
pending authentication tokens, challenge IDs, and SMS verification context stay
in encrypted flow state.

Roll out in this order:

1. set `WORKOS_RADAR_MODE=off` while validating the rest of authentication;
2. enable the WorkOS Radar preview and use `log` in staging;
3. inspect Radar events and false positives without changing authorization;
4. deploy `enforce` only after the log results are understood;
5. repeat the staged rollout in production with a rollback plan to `log`.

Radar is a risk signal, not an application role or membership source. Turning
Radar off must not remove the PostgreSQL authorization checks.

## Vercel deployment

In the Vercel project/environment matching the WorkOS environment, configure:

```dotenv
WEB_AUTH_MODE=workos
WORKOS_API_KEY=<server-secret>
WORKOS_CLIENT_ID=<workos-client-id>
WORKOS_COOKIE_PASSWORD=<output-of-openssl-rand-base64-48>
WORKOS_REDIRECT_URI=https://app.example.com/auth/callback
WORKOS_SESSION_COOKIE_NAME=saas_session
WORKOS_FLOW_COOKIE_NAME=saas_auth_flow
WORKOS_SOCIAL_PROVIDERS=GoogleOAuth,MicrosoftOAuth
WORKOS_RADAR_MODE=log
NEXT_PUBLIC_WORKOS_CLIENT_ID=<workos-client-id>
API_URL=https://api.example.com
```

The API URL and OIDC values used by the server-side API client must point to the
same environment. Keep `WORKOS_API_KEY` and `WORKOS_COOKIE_PASSWORD` out of
`NEXT_PUBLIC_*` variables. Changing the cookie password invalidates existing
sealed session/flow cookies; schedule that as a session reset. Rotate the
WorkOS API key through Vercel's secret store and redeploy rather than committing
it.

Leave `NEXT_PUBLIC_WORKOS_CLIENT_ID` unset while `WORKOS_RADAR_MODE=off`.
When Radar is `log` or `enforce`, set it to the exact same value as
`WORKOS_CLIENT_ID`; the web configuration rejects a missing or mismatched value.

The custom UI routes are:

```text
/sign-in                 password, social, and SSO entry
/sign-up                 account creation
/magic-auth              Magic Auth start and code completion
/forgot-password         generic password-recovery request
/reset-password          one-time token capture and clean redirect
/reset-password/new      new-password form
/verify-email            verification-code form
/auth/challenge          TOTP, organization, and Radar transitions
/auth/sso                enterprise SSO transition
/auth/oauth/:provider    social OAuth start
/auth/callback           state-checked OAuth callback
```

All pending authentication material is held in the encrypted HttpOnly flow
cookie. Successful transitions write the sealed session cookie before
redirecting. Logout is a POST-backed action that clears local cookies and then
uses the WorkOS logout URL when a valid session is available.

## Local and CI mode

WorkOS credentials are not required for local development or CI. Copy the
examples and keep both sides in local mode:

```dotenv
# apps/api/.env
AUTH_MODE=local
AUTH_LOCAL_TOKEN=<a-local-token-at-least-32-characters>

# apps/web/.env
WEB_AUTH_MODE=local
API_AUTH_TOKEN=<the-same-local-token>
API_URL=http://localhost:3001
```

`compose.yml` supplies a development-only token for the container smoke stack.
Replace it when sharing a local environment; it is not a production
credential. Local mode is deliberately unavailable when `NODE_ENV=production`.
Do not use `API_AUTH_TOKEN` as a substitute for WorkOS in a deployed
production environment.

## Security and runbook

- **Redirect mismatch:** compare the exact `WORKOS_REDIRECT_URI` with the
  registered callback, including scheme, host, path, and environment.
- **Logout mismatch:** allow the configured redirect origin/root in WorkOS and
  use an application-relative post-logout path only.
- **Invalid bearer token:** verify the API's issuer, JWKS URI, client ID, and
  clock; do not disable signature validation or add the WorkOS API key to the
  API.
- **First login rejected:** confirm the JWT template emits both `email` and
  boolean `email_verified: true`; an unverified or missing email is expected to
  fail closed.
- **OAuth callback rejected:** restart the flow. State and PKCE are one-time
  encrypted state; never copy them into a URL or hidden form field.
- **Radar unexpectedly blocks:** return to `log`, inspect the WorkOS Radar
  events, and correct the rollout/configuration before trying `enforce` again.
- **Stale session after rotation:** clear the session cookie or sign out; a
  cookie-password rotation intentionally invalidates old sealed material.
- **Production startup failure:** inspect the complete WorkOS/API environment;
  production rejects local mode, weak cookie passwords, HTTPS violations, and
  partial OIDC/WorkOS configuration.

The following invariants are part of the deployment contract: no hosted AuthKit
UI, no passkeys in this custom UI, no client-side access/refresh-token storage,
no secrets or pending tokens in URLs/forms/local storage, generic account-safe
error copy, trusted server request context, and PostgreSQL as the only source
of application roles and permissions.
