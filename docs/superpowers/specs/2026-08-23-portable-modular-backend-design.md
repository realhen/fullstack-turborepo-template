# Portable Modular Backend Design

**Status:** Approved for implementation, revised after final review

**Date:** 2026-08-23

## Purpose

Restructure the backend as a portable modular monolith, make generated API
clients deterministic without committing generated artifacts, harden the
runtime for concurrent container tasks, and remove the application's AWS SQS
dependency. The same web, API, worker, migration, and PostgreSQL containers
must run under Docker Compose, ECS Fargate, Kubernetes, another cloud, or bare
metal without changing application code.

## Goals

- Remove `apps/api/src/saas` and make each domain a top-level NestJS module.
- Group every substantial feature by presentation, application, domain, and
  infrastructure responsibilities.
- Put only genuinely cross-cutting NestJS concerns under `apps/api/src/common`.
- Create one managed PostgreSQL pool per API task and reuse it across modules.
- Make all API and worker behavior safe when several container tasks run at
  once.
- Replace SQS with a horizontally safe PostgreSQL-backed billing job queue.
- Keep AWS CDK as an optional deployment adapter without requiring AWS services
  in application code.
- Generate the frontend client from the NestJS source in CI and web image
  builds, while keeping generated artifacts out of Git.
- Keep API, web, and worker deploys coordinated and rolling-update compatible.
- Explain the database lifecycle, migration flow, and architectural boundaries
  in the repository documentation.

## Non-goals

- Splitting the API into independently deployed microservices.
- Adding Redis, Valkey, RabbitMQ, NATS, or another required stateful service.
- Replacing PostgreSQL, Drizzle, Stripe, OIDC, Next.js, or NestJS.
- Changing public HTTP routes or successful response bodies.
- Renaming already-applied migration files. Historical migrations are
  immutable and checksum-verified.
- Building a provider-neutral infrastructure-as-code framework. `apps/infra`
  remains the supported AWS deployment implementation.

## Architectural decision

Use a modular monolith for synchronous business behavior, a separate worker
process for durable asynchronous billing jobs, and Next.js server-side code as
the frontend-facing BFF. Feature boundaries are enforced inside the API so a
module can be extracted later without paying the operational cost of
microservices now.

The API and web are one release unit. They are built from the same commit and
deployed in an ordered rollout, but they still honor backward compatibility
because old and new container tasks overlap during rolling deployments.

## API source layout

```text
apps/api/src/
├── common/
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   ├── middleware/
│   └── types/
├── database/
│   ├── database.constants.ts
│   ├── database.module.ts
│   └── database.service.ts
├── auth/
│   ├── application/
│   ├── domain/
│   ├── infrastructure/
│   └── auth.module.ts
├── organizations/
│   ├── application/
│   ├── domain/
│   ├── infrastructure/
│   ├── presentation/
│   └── organizations.module.ts
├── projects/
│   ├── application/
│   ├── domain/
│   ├── infrastructure/
│   ├── presentation/
│   └── projects.module.ts
├── billing/
│   ├── application/
│   ├── domain/
│   ├── infrastructure/
│   ├── presentation/
│   └── billing.module.ts
├── audit/
│   ├── application/
│   ├── domain/
│   ├── infrastructure/
│   ├── presentation/
│   └── audit.module.ts
├── health/
├── app.module.ts
└── bootstrap.ts
```

Only directories that contain real files are created. Empty placeholder
directories are not committed.

### Grouping rules

- `presentation` contains controllers, request/response DTOs, and
  feature-specific HTTP guards and pipes.
- `application` contains use-case orchestration and injectable services.
- `domain` contains business types, ports, injection tokens, constants, and
  rules without database or transport dependencies.
- `infrastructure` contains PostgreSQL stores, external provider adapters, and
  in-memory development/test adapters.
- `common` contains concerns used across multiple features, such as the global
  exception filter, request context middleware, authentication decorators, the
  cross-feature scope guard, and shared request types. It is not a catch-all
  for feature-specific helpers.
- Each feature module is its own composition root and exports only deliberate
  cross-module interfaces.

### Module composition

- `AppModule` imports `DatabaseModule`, `AuthModule`, `OrganizationsModule`,
  `ProjectsModule`, `AuditModule`, and `BillingModule` directly. `SaasModule`
  is deleted.
- `AuthModule` owns authentication adapters, identity resolution, principals,
  and `AuthenticationService`.
- `OrganizationsModule` owns organization membership, permission evaluation,
  invitations, API keys, organization guards, and organization pipes. It may
  import `AuthModule` and `DatabaseModule`.
- `ProjectsModule` owns project membership and management. It may import
  `OrganizationsModule` and `DatabaseModule`.
- `AuditModule` owns audit writes and reads. It may import
  `OrganizationsModule` and `DatabaseModule`.
- `BillingModule` owns billing providers, webhook receipt, projections, and
  organization billing authorization. It may import `OrganizationsModule` and
  `DatabaseModule`.
- The global scope guard is registered at the application composition root so
  it can consume explicit exports from `AuthModule` and `ProjectsModule`
  without creating circular feature-module imports.

Controllers remain thin, DTO validation stays at the HTTP boundary, and
feature modules do not import another feature's infrastructure files.

## Database ownership and lifecycle

`packages/database` remains a framework-neutral package because the API,
worker, migration task, seed task, and tests all use it. It owns:

- Drizzle schema definitions.
- Reviewed, append-only SQL migrations.
- PostgreSQL connection configuration.
- Tenant transactions and RLS context.
- Shared persistence primitives used by more than one deployable process.

Nest-specific pool lifecycle belongs in `apps/api/src/database`.

### Connection configuration

The portable configuration surface is:

- `DATABASE_URL`, or
- standard PostgreSQL `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`,
  `PGDATABASE`, and `PGSSLMODE` variables.

The application-specific `DATABASE_SECRET` JSON parser is removed. AWS CDK can
still inject RDS secret fields into standard PostgreSQL environment variables,
so AWS convenience remains in `apps/infra` rather than application code.

Pool configuration is explicit:

- `DATABASE_POOL_MAX`
- `DATABASE_POOL_IDLE_TIMEOUT_MS`
- `DATABASE_POOL_CONNECTION_TIMEOUT_MS`

Every API task creates one pool, shares it across all feature adapters, and
closes it through Nest shutdown hooks. Worker and migration processes own and
close their own pools. Capacity planning follows:

```text
(maximum API tasks × API pool maximum)
+ (maximum worker tasks × worker pool maximum)
+ migration and operator headroom
< PostgreSQL max_connections
```

The AWS deployment documents concrete values for its configured task limits.
Its migration init container and API application container do not hold pools
at the same time, so the API task's pool allowance is counted once. RDS Proxy
remains an optional future infrastructure optimization, not an application
requirement.

### Tenant isolation

Tenant-scoped operations continue to:

1. acquire one pooled client;
2. begin a transaction;
3. `SET LOCAL ROLE saas_runtime`;
4. set transaction-local organization and actor context;
5. execute through the tenant repository;
6. commit or roll back before releasing the client.

Transaction-local state must never escape back into the pool.

### Migrations

Migrations do not run inside the API application process. Local Compose runs a
one-off migration container before the API. In the optional AWS adapter, every
new API task definition includes a nonessential migration init container and
the API container has an ECS `SUCCESS` dependency on it. The init container
uses the same commit and database configuration as the API image. Multiple new
tasks may invoke the runner concurrently, but its PostgreSQL advisory lock,
checksum verification, and immutable applied files serialize execution; tasks
that acquire the lock later verify the already-applied migrations and exit.
Migration failure prevents the new API task from starting and therefore
prevents service stabilization.

This repository is an undeployed template. Migrations `0000` through `0004`
are its pre-release baseline, so no legacy production database or mixed-version
production task compatibility is assumed for that initial baseline. Migration
`0004` nevertheless initializes an entitlement projection version for every
existing billing account and enqueues reconciliation work so seeded or local
pre-release data converges on provider state. Once a release has been deployed,
all later schema changes are append-only and use expand/contract compatibility.

## Portable PostgreSQL billing job queue

SQS is removed from the application and AWS stack. PostgreSQL is the only
required durable service.

The webhook path remains a transactional inbox/outbox flow:

```text
Stripe webhook
  -> verify signature
  -> transactionally insert webhook inbox and billing job
  -> return durable receipt
```

The worker path becomes:

```text
claim available PostgreSQL job with a lease
  -> call the authenticated internal API processor
  -> mark the lease complete on success
  -> release with backoff on retryable failure
  -> mark permanently failed after the configured attempt limit
```

### Queue guarantees

- Claiming uses a transaction with `FOR UPDATE SKIP LOCKED` and an atomic
  update that assigns a unique lease token and expiry.
- Work happens outside the claim transaction; database locks are not held
  across HTTP or Stripe calls.
- Completion, retry, and lease extension require the current lease token.
- Expired leases are reclaimable after worker crashes.
- Multiple worker containers can process different jobs concurrently without
  processing the same live lease.
- Processing remains idempotent because a lease can expire after an external
  side effect but before completion is recorded.
- Failed jobs retain attempts and the last error. Jobs reaching the configured
  maximum are marked dead and excluded from normal claims, providing a
  queryable dead-letter state.
- Retry delay, lease duration, maximum attempts, batch size, and poll interval
  are validated configuration.

The existing billing outbox migration is not edited. A new append-only
migration evolves the table and indexes for the final queue state.

### Billing concurrency

- Webhook uniqueness remains enforced by `(provider, provider_event_id)`.
- Stripe customer creation receives a stable organization-based idempotency
  key so concurrent API tasks cannot create distinct provider customers for
  the same organization.
- Subscription and invoice projections retain provider timestamp guards.
- Entitlement replacement and related projection writes execute atomically and
  reject stale provider versions.
- Repeated delivery of a completed webhook becomes a no-op.

### Removed queue dependencies

- `@aws-sdk/client-sqs`
- SQS publisher and consumer adapters
- LocalStack and its initialization script
- SQS queue, DLQ, permissions, environment variables, and queue alarms in CDK
- Generic `ASYNC_QUEUE_URL` configuration

The worker queue remains behind provider-neutral job-store contracts so another
adapter can be added later without changing billing services. The API keeps no
generic outbox-consumer method or `dispatched_at` dispatch path: it only inserts
durable jobs transactionally. No unused SQS, Redis, or broker adapter is shipped
now.

## Generated API client

`packages/api-client` remains the only frontend API transport because it owns
hand-written runtime behavior shared by server and browser consumers:

- `openapi-fetch` construction;
- server and browser base URL behavior;
- response unwrapping and normalized API errors;
- stable response helper types.

Generated files are build artifacts, not source:

```text
packages/api-client/openapi.json
packages/api-client/src/generated/
```

Both are removed from Git and ignored.

One root command, `pnpm api-client:generate`, creates the OpenAPI document from
the NestJS source and then generates TypeScript paths. It never fetches a live
deployment. Generation runs automatically before repository development,
build, and check commands, in CI, and during the web Docker image build.

The web image performs generation while the full monorepo source is available,
before pruning/building the web workspace. CI generates first and validates
linting, typechecking, tests, and builds rather than diff-checking committed
generated output.

## Release and compatibility flow

API, web, and worker images come from the same commit. Deployment order is:

```text
API migration init -> API stabilization -> web rollout -> worker rollout
```

The AWS CDK adapter enforces the schema gate inside each API task and expresses
service dependencies so CloudFormation does not update the services in
parallel. On a first deploy, the API cannot start before the baseline exists.
On later rolling updates, old tasks remain available while new tasks run the
expand migration and then start the new API. Portable deployment documentation
defines the equivalent migrate-before-API order for other environments.

Rolling releases still use expand/contract compatibility:

- New API fields and endpoints are additive.
- Renames and removals require at least one compatibility release.
- Migrations must support old and new application tasks during the rollout.
- A generated client from the new commit must tolerate the API version present
  during every phase of the coordinated release.

Generic API and worker Docker image targets contain no AWS downloads, trust
bundles, SDKs, or runtime assumptions. Their default targets accept ordinary
PostgreSQL TLS configuration, including an operator-mounted `PGSSLROOTCERT`.
The optional AWS CDK adapter explicitly builds `aws-runner` targets that add the
Amazon RDS CA bundle and supplies `PGSSLMODE=verify-full`. API environment
validation accepts the standard PostgreSQL SSL modes used by `node-postgres`,
including `disable`, `require`, `verify-ca`, and `verify-full`.

## Microservice decision

The API remains one deployable modular monolith. Splitting users, projects,
subscriptions, billing, and a BFF into separate services now would add network
contracts, distributed transactions, retries, tracing, deployment ordering,
and separate ownership without an observed scaling or team boundary.

Next.js server-side code already acts as the useful frontend BFF. The worker is
separate because asynchronous execution has a distinct lifecycle and scaling
profile, not because it owns an independent business domain.

A feature is considered for extraction only when at least one concrete driver
exists:

- independently required scaling;
- independent release cadence or team ownership;
- a materially different security boundary;
- isolation from repeated failures;
- a stable bounded context that no longer requires cross-domain database
  transactions.

Feature modules expose deliberate application interfaces and never allow
cross-feature infrastructure imports so those extraction seams remain viable.

## Error handling and observability

- The existing stable HTTP error envelope and request ID propagation remain.
- Job failures record job ID, attempt, lease state, error, and next retry time
  without logging secrets or full payment payloads.
- Permanent job failures are observable through database state and structured
  worker logs.
- Worker shutdown awaits an in-flight lease-extension request before it can
  complete or release the same job, and structured logs distinguish an actual
  retry/dead transition from a lost lease.
- Health checks distinguish process health from dependency readiness where
  needed; a transient PostgreSQL failure must not leak tenant context or leave
  a job permanently leased.
- Nest's built-in in-memory throttler is documented as per-task protection.
  The AWS WAF remains the shared AWS edge limiter; exact portable application
  quotas would require a future shared throttling store.

## Verification strategy

### Structural verification

- No `apps/api/src/saas` directory or `SaasModule` import remains.
- Every domain has its own Nest module and expected responsibility folders.
- Cross-feature imports use exported application/domain interfaces, not
  infrastructure files.
- The API creates one pool in one composition location.

### Unit and module tests

- Existing service, guard, provider, and controller behavior remains covered
  after moves.
- Nest testing modules compile the new module graph without circular
  dependencies.
- Database lifecycle tests prove one pool is shared and shutdown closes it.
- Queue unit tests cover claim, completion, lease extension, retry, expiry,
  attempt exhaustion, and stale lease tokens.
- Billing tests cover stable Stripe idempotency keys and stale projection
  rejection.

### PostgreSQL integration tests

- Two concurrent claimers never receive the same live job.
- A crashed worker's expired lease becomes claimable.
- A stale lease token cannot complete or release a reassigned job.
- Duplicate webhook receipts create one durable billing job.
- Concurrent/stale billing projections preserve the newest provider state.
- Migrations remain serialized and checksum-safe.

### Build and runtime verification

- A clean checkout with no generated client files can run
  `pnpm api-client:generate` and then build the web app.
- Generated files remain untracked.
- Docker Compose starts PostgreSQL, migration, seed, API, worker, and web with
  no LocalStack or cloud credentials.
- Container smoke tests cover API health, web health, authentication failure,
  Swagger assets, and a durable billing job round trip.
- AWS CDK synthesis contains no SQS resources and retains deployable web, API,
  worker, migration, RDS, networking, security, and observability resources.
- CDK tests prove the API container depends on successful completion of its
  migration init container and that the generic and AWS image targets remain
  separate.
- Final acceptance runs `pnpm check`, `pnpm format:check`, relevant PostgreSQL
  integration tests, Docker Compose verification, `git diff --check`, and
  working-tree scope inspection.

## Documentation updates

The README will explain:

- feature-module organization and what belongs in `common`;
- how the API obtains and shares its database pool;
- how migrations, seeding, RLS, and tenant transactions work;
- how the PostgreSQL billing queue handles leases, retries, and dead jobs;
- how API client generation works locally, in CI, and in the web image;
- the ordered deployment and expand/contract compatibility rule;
- why the modular monolith is preferred and when a service should be
  extracted;
- that `apps/infra` is an optional AWS deployment adapter while application
  containers remain compute-provider agnostic.
