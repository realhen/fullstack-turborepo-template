# SaaS Turborepo Template

A production-oriented TypeScript SaaS foundation with a Next.js frontend,
NestJS API, PostgreSQL tenancy, Stripe billing, an asynchronous worker, and AWS
CDK infrastructure. It is designed to run completely locally before anything
is deployed.

## Included

| Area       | What is ready                                                                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web        | Next.js App Router SaaS shell, organization/project selector, generated API client, graceful auth/error states, optional PostHog                                      |
| API        | NestJS, OpenAPI, OIDC/local authentication adapters, durable identity linking, organization/project authorization, validation, throttling, structured errors and logs |
| SaaS data  | Users, external identities, organizations, projects, memberships, roles, permissions, invitations, service accounts, API keys, and audit events                       |
| Billing    | Controlled plan catalog, Stripe Checkout and Billing Portal, signed/idempotent webhooks, subscription/invoice/entitlement projections, local offline provider         |
| Async work | Transactional webhook inbox/outbox, SQS worker, retries and leases, LocalStack adapter                                                                                |
| AWS        | ECS Fargate web/API/worker, RDS PostgreSQL, SQS/DLQ, WAF, HTTPS ALB, Cloud Map, Secrets Manager, autoscaling, CloudWatch dashboard and alarms                         |

Enterprise identity features such as SAML SSO and directory synchronization are
intentionally outside this template.

## Repository layout

- `apps/web` — browser experience and server-rendered API consumption.
- `apps/api` — business rules and all authoritative auth/billing decisions.
- `apps/worker` — durable asynchronous billing processing.
- `apps/infra` — AWS CDK production stack.
- `packages/api-client` — generated OpenAPI types and the only frontend API transport.
- `packages/database` — schema, reviewed SQL migrations, RLS helpers, repositories, and local seed.
- `packages/billing` — provider-neutral outbox contracts and dispatcher.
- `packages/ui` — reusable React primitives.

## Run the entire product locally

Requirements are Docker with Compose. No AWS account, hosted identity provider,
or Stripe account is needed.

```bash
docker compose up --build --wait
```

This starts PostgreSQL, applies migrations, seeds the local organization and
project, creates a LocalStack SQS queue, then starts the API, worker, and web
app. The local billing provider never contacts Stripe.

- Web: <http://localhost:3000>
- API health: <http://localhost:3001/api/v1/health>
- Swagger: <http://localhost:3001/api/docs>
- PostgreSQL: `localhost:5432`
- LocalStack: `localhost:4566`

The development bearer token is documented in the example environment files
and is wired into both local containers. It is deliberately rejected when
`NODE_ENV=production`.

To reset all local state:

```bash
docker compose down --volumes --remove-orphans
```

## Hot-reload development

Install Node.js 24 and enable Corepack, then copy the example environments:

```bash
corepack enable
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
docker compose up -d postgres localstack
pnpm db:migrate
DATABASE_SEED_LOCAL=true pnpm db:seed
pnpm dev
```

Useful commands:

```bash
pnpm check             # lint, typecheck, test, and build every workspace
pnpm format:check      # verify formatting
pnpm openapi:generate  # regenerate the Nest OpenAPI snapshot
pnpm --filter @repo/api-client generate
pnpm dev:containers    # production-like local stack
```

## Authentication and authorization

The backend accepts any standards-compliant OIDC issuer, so Supabase, WorkOS,
Auth0, Cognito, and similar providers can be swapped without changing business
services. Configure:

```dotenv
AUTH_MODE=oidc
AUTH_ISSUER=https://issuer.example.com/
AUTH_JWKS_URI=https://issuer.example.com/.well-known/jwks.json
AUTH_AUDIENCE=your-api-audience
# AUTH_CLIENT_ID can be used instead of AUTH_AUDIENCE when the provider uses client_id.
```

JWT signatures, issuer, and audience/client ID are validated first. An existing
external identity is resolved to the application user. A first login is
provisioned only when the configured issuer asserts a verified email; unverified
or missing emails fail closed. Provider scopes never substitute for application
roles.

The frontend reads an access token from a configurable Secure, HttpOnly session
cookie (`AUTH_ACCESS_TOKEN_COOKIE`) and forwards it server-to-server. A fixed
`API_AUTH_TOKEN` exists only for local automation. The provider-specific login
and callback UI is deliberately a small adapter boundary: configure the chosen
provider to set that cookie rather than coupling the template to one vendor.

Authorization is enforced in the API through organization permissions and
project roles. Default roles are owner, admin, member, and viewer. PostgreSQL RLS
adds a second tenant boundary by setting the authorized organization and actor
inside every resource transaction and switching to the non-owner
`saas_runtime` role.

Invitations store only SHA-256 token hashes, expire, can be revoked, and return
the raw credential once. API keys use per-key scrypt hashes and are also shown
only once. Management actions write tenant-scoped audit events.

## Stripe billing

Browser input uses allow-listed plan codes; Stripe price IDs and secrets remain
server-only. Configure the four keys in `apps/api/.env.example`, then send Stripe
events to:

```text
POST /api/v1/billing/stripe/webhook
```

The handler verifies the raw request with Stripe's SDK and commits the webhook
inbox record and outbox message in one transaction before returning success.
The worker publishes through SQS and calls the authenticated internal processor.
Checkout redirects are never treated as payment authority; subscription,
invoice, and entitlement state comes from verified webhooks and reconciliation.

Use Stripe test mode and the Stripe CLI when testing the real provider locally.
Keep `BILLING_PROVIDER=local` for fully offline feature development.

## Type-safe API boundary

All frontend calls use `@repo/api-client`; direct backend `fetch` and Axios calls
are blocked by the web ESLint configuration. The contract flow is:

```text
Nest controllers -> OpenAPI snapshot -> generated TypeScript paths -> openapi-fetch -> Next.js
```

CI regenerates both OpenAPI artifacts and fails if committed output is stale.
When changing an endpoint, update its Swagger response metadata and commit the
regenerated client in the same pull request.

## Analytics and operations

PostHog is disabled unless both `NEXT_PUBLIC_POSTHOG_KEY` and optionally its host
are configured. The default uses in-memory persistence, disables autocapture,
and does not identify users, reducing accidental PII collection. Add only an
explicit, reviewed event taxonomy for product analytics.

The API emits JSON request logs with propagated request IDs and a stable error
envelope. The AWS stack enables ECS Container Insights and creates a CloudWatch
dashboard plus alarms for API 5xx responses, queue age, dead-letter messages,
and database CPU. An optional alarm email subscribes to the generated SNS topic.

## AWS deployment

CDK requires an existing regional ACM certificate and domain. Stripe is enabled
when `applicationSecretsArn` points to a JSON secret containing:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_STARTER_MONTHLY`
- `STRIPE_PRICE_PRO_MONTHLY`

Example:

```bash
pnpm --filter @repo/infra exec cdk deploy \
  -c certificateArn="$CERTIFICATE_ARN" \
  -c domainName=app.example.com \
  -c hostedZoneId="$HOSTED_ZONE_ID" \
  -c hostedZoneName=example.com \
  -c applicationSecretsArn="$APPLICATION_SECRETS_ARN" \
  -c authIssuer=https://issuer.example.com/ \
  -c authJwksUri=https://issuer.example.com/.well-known/jwks.json \
  -c authAudience=your-api-audience \
  -c alarmEmail=on-call@example.com
```

The stack outputs a migration task definition, cluster, private subnet IDs, and
security group. Run that one-off ECS task before rolling out a schema-dependent
application version. The migration user must be able to create the non-login
`saas_runtime` role on first deployment; subsequent runs are checksum-verified
and serialized by a PostgreSQL advisory lock.

RDS deletion protection, encrypted storage, Multi-AZ, 14-day backups, secret
rotation, private subnets, an SQS DLQ, HTTPS, WAF rules, and rolling deployment
circuit breakers are enabled by default. The stack creates billable resources;
always review `cdk diff` and AWS pricing first.

## CI guarantees

Pull requests run formatting, lint, typechecking, tests, builds, OpenAPI drift
checks, CDK synthesis, real PostgreSQL migration/RLS integration tests, and a
full Docker Compose smoke test. Dependabot keeps npm and GitHub Actions updates
visible for review.
