# Portable Modular Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a compute-provider-agnostic modular NestJS backend with one PostgreSQL pool per task, a leased PostgreSQL billing queue, and deterministic uncommitted OpenAPI client generation.

**Architecture:** The API becomes a modular monolith composed from top-level feature modules and a small cross-cutting `common` area. PostgreSQL is the only required durable runtime service; a separate worker claims leased billing jobs from the transactional outbox and calls the API's authenticated internal processor. API client artifacts are generated from NestJS source during local checks, CI, and the web image build.

**Tech Stack:** Node.js 24, pnpm 11.22.0, TypeScript 6, NestJS 11, Next.js 16, PostgreSQL 16, Drizzle ORM, `pg`, Vitest, OpenAPI, `openapi-typescript`, Docker Compose, AWS CDK.

**Spec:** `docs/superpowers/specs/2026-08-23-portable-modular-backend-design.md`

## Global Constraints

- Preserve every public HTTP route and successful response body.
- Do not edit or rename applied migrations `0000_saas_foundation.sql`, `0001_tenant_rls.sql`, or `0002_billing.sql`.
- Keep deployable services in `apps/` and reusable domain-agnostic code in `packages/`.
- Do not import application code across app boundaries; web, API, and worker communicate over HTTP.
- Validate NestJS inputs at the boundary and keep controllers thin.
- Keep `apps/infra` as the optional AWS deployment adapter; application containers must require no AWS runtime API.
- Use only PostgreSQL as a required durable service. Do not add Redis, Valkey, RabbitMQ, NATS, or another broker.
- Production must fail closed without PostgreSQL configuration; in-memory adapters remain development/test behavior only.
- Never commit generated OpenAPI JSON or generated TypeScript client paths.
- Preserve concurrent user edits and do not modify files outside the task's stated ownership.
- Use strict TDD for behavioral code: write the test, observe the expected failure, add the minimum implementation, and observe the pass.
- Before handoff run `pnpm check` and `pnpm format:check` plus the integration and container checks specified below.
- This repository has no existing deployment. Migrations `0000` through `0004` are the pre-release baseline; compatibility rules apply to migrations introduced after that baseline ships.

---

### Task 1: Portable PostgreSQL configuration and one Nest-managed pool

**Files:**

- Create: `packages/database/test/connection-string.test.ts`
- Create: `apps/api/src/database/database.constants.ts`
- Create: `apps/api/src/database/database.service.ts`
- Create: `apps/api/src/database/database.module.ts`
- Create: `apps/api/src/database/database.service.spec.ts`
- Modify: `packages/database/src/connection-string.ts`
- Modify: `packages/database/src/client.ts`
- Modify: `packages/database/src/migrate.ts`
- Modify: `packages/database/src/seed.ts`
- Modify: `packages/database/src/index.ts`
- Modify: `apps/api/src/env.ts`
- Modify: `apps/api/.env.example`

**Interfaces:**

- Produces `databaseConfigFromEnvironment(environment): PoolConfig | undefined`.
- Produces `requireDatabaseConfig(environment): PoolConfig`.
- Changes `createDatabase(config?: PoolConfig)` to accept portable `pg` configuration.
- Produces `DATABASE_POOL`, a Nest injection token for `Pool | null`.
- Produces `DatabaseLifecycleService`, which closes the injected pool on application shutdown.

- [ ] **Step 1: Write failing portable-configuration tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  databaseConfigFromEnvironment,
  requireDatabaseConfig,
} from '../src/connection-string'

describe('databaseConfigFromEnvironment', () => {
  it('prefers DATABASE_URL and applies bounded pool settings', () => {
    expect(
      databaseConfigFromEnvironment({
        DATABASE_POOL_CONNECTION_TIMEOUT_MS: '2500',
        DATABASE_POOL_IDLE_TIMEOUT_MS: '15000',
        DATABASE_POOL_MAX: '6',
        DATABASE_URL: 'postgresql://app:secret@db:5432/app',
      }),
    ).toEqual({
      connectionString: 'postgresql://app:secret@db:5432/app',
      connectionTimeoutMillis: 2500,
      idleTimeoutMillis: 15000,
      max: 6,
    })
  })

  it('supports standard PostgreSQL environment variables', () => {
    expect(
      databaseConfigFromEnvironment({
        PGDATABASE: 'app',
        PGHOST: 'db.internal',
        PGPASSWORD: 'secret',
        PGPORT: '5432',
        PGSSLMODE: 'require',
        PGUSER: 'runtime',
      }),
    ).toMatchObject({
      database: 'app',
      host: 'db.internal',
      password: 'secret',
      port: 5432,
      ssl: { rejectUnauthorized: true },
      user: 'runtime',
    })
  })

  it('rejects partial standard PostgreSQL configuration', () => {
    expect(() => requireDatabaseConfig({ PGHOST: 'db.internal' })).toThrow(
      'DATABASE_URL or complete PGHOST/PGUSER/PGPASSWORD/PGDATABASE configuration is required',
    )
  })
})
```

- [ ] **Step 2: Run the tests and verify the expected failure**

Run: `pnpm --filter @repo/database test -- connection-string.test.ts`

Expected: FAIL because the portable configuration functions and pool fields do not exist.

- [ ] **Step 3: Implement portable connection and pool parsing**

Use `pg.PoolConfig` and integer validation with explicit minimums. `DATABASE_URL` takes precedence. Standard PostgreSQL variables must be complete when any of them is supplied. Map `PGSSLMODE=require` to `{ rejectUnauthorized: true }`, and leave SSL undefined for absent/disabled values. Remove `DATABASE_SECRET` and `RdsSecret` from application code.

```ts
export type DatabaseEnvironment = NodeJS.ProcessEnv & {
  DATABASE_POOL_CONNECTION_TIMEOUT_MS?: string
  DATABASE_POOL_IDLE_TIMEOUT_MS?: string
  DATABASE_POOL_MAX?: string
  DATABASE_URL?: string
}

export function databaseConfigFromEnvironment(
  environment: DatabaseEnvironment = process.env,
): PoolConfig | undefined

export function requireDatabaseConfig(
  environment: DatabaseEnvironment = process.env,
): PoolConfig
```

Update `createDatabase` to construct `new Pool(config)` and update migration and seed entrypoints to call `requireDatabaseConfig()`.

- [ ] **Step 4: Verify portable configuration passes**

Run: `pnpm --filter @repo/database test -- connection-string.test.ts`

Expected: PASS with all three configuration behaviors.

- [ ] **Step 5: Write the failing pool-lifecycle test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { DatabaseLifecycleService } from './database.service'

describe('DatabaseLifecycleService', () => {
  it('closes its task-local pool during application shutdown', async () => {
    const pool = { end: vi.fn().mockResolvedValue(undefined) }
    const service = new DatabaseLifecycleService(pool as never)

    await service.onApplicationShutdown()

    expect(pool.end).toHaveBeenCalledOnce()
  })

  it('allows development mode without a configured pool', async () => {
    await expect(
      new DatabaseLifecycleService(null).onApplicationShutdown(),
    ).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 6: Run the lifecycle test and verify the expected failure**

Run: `pnpm --filter @repo/api test -- database.service.spec.ts`

Expected: FAIL because the database lifecycle service is absent.

- [ ] **Step 7: Implement `DatabaseModule` and environment validation**

`DatabaseModule` provides one `Pool | null` per Nest application process and exports only `DATABASE_POOL`. Production environment validation requires either `DATABASE_URL` or the complete standard `PG*` set. Register `DatabaseLifecycleService` so Nest shutdown hooks close the pool.

```ts
export const DATABASE_POOL = Symbol('DATABASE_POOL')

@Injectable()
export class DatabaseLifecycleService implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool | null) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool?.end()
  }
}

@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      useFactory: (): Pool | null => {
        const config = databaseConfigFromEnvironment()
        return config ? createDatabase(config).pool : null
      },
    },
    DatabaseLifecycleService,
  ],
  exports: [DATABASE_POOL],
})
export class DatabaseModule {}
```

- [ ] **Step 8: Verify database unit tests, types, and formatting**

Run: `pnpm --filter @repo/database test && pnpm --filter @repo/api test && pnpm --filter @repo/database typecheck && pnpm --filter @repo/api typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 9: Commit the database lifecycle**

```bash
git add packages/database apps/api/src/database apps/api/src/env.ts apps/api/.env.example
git commit -m "refactor(api): centralize portable database lifecycle"
```

### Task 2: Cross-cutting common area and `AuthModule`

**Files:**

- Move: `apps/api/src/observability/http-exception.filter.ts` -> `apps/api/src/common/filters/http-exception.filter.ts`
- Move: `apps/api/src/observability/request-context.ts` -> `apps/api/src/common/middleware/request-context.middleware.ts`
- Move: `apps/api/src/saas/auth/auth.decorators.ts` -> `apps/api/src/common/decorators/auth.decorators.ts`
- Move: `apps/api/src/saas/auth/scope.guard.ts` -> `apps/api/src/common/guards/scope.guard.ts`
- Move: `apps/api/src/saas/auth/scope.guard.spec.ts` -> `apps/api/src/common/guards/scope.guard.spec.ts`
- Move the remaining `apps/api/src/saas/auth/*` files into the matching `apps/api/src/auth/application`, `domain`, and `infrastructure` directories.
- Create: `apps/api/src/auth/auth.module.ts`
- Create: `apps/api/src/auth/auth.module.spec.ts`
- Modify: `apps/api/src/bootstrap.ts`
- Modify moved imports and tests.

**Interfaces:**

- `AuthModule` exports `AuthenticationService` and the principal/domain types needed through TypeScript imports.
- `ScopeGuard` remains an `APP_GUARD` registered by `AppModule`; it is not owned by `AuthModule` because it also consumes `ProjectService`.
- `RequireAuthenticated`, `RequireScopes`, `RequireOrganizationPermissions`, and `CurrentPrincipal` remain behavior-compatible decorators.

- [ ] **Step 1: Write a failing `AuthModule` compilation test**

```ts
describe('AuthModule', () => {
  it('provides AuthenticationService without project or organization modules', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        AuthModule,
      ],
    }).compile()
    expect(module.get(AuthenticationService)).toBeInstanceOf(
      AuthenticationService,
    )
    await module.close()
  })
})
```

- [ ] **Step 2: Run the module test and verify the expected failure**

Run: `pnpm --filter @repo/api test -- auth.module.spec.ts`

Expected: FAIL because `AuthModule` and its final paths do not exist.

- [ ] **Step 3: Move common and authentication files mechanically**

Use `git mv` for tracked files. Place authentication service in `application`, principal and port types in `domain`, and local/OIDC/database adapters in `infrastructure`. Update all relative imports without changing behavior.

- [ ] **Step 4: Create `AuthModule` with the extracted factories**

Move the existing `AUTHENTICATION_ADAPTER` and `IDENTITY_RESOLVER` factories out of `SaasModule`. Inject `DATABASE_POOL` for the database identity resolver and preserve disabled/local/OIDC behavior exactly. Export `AuthenticationService` only.

- [ ] **Step 5: Run RED/GREEN auth and common tests**

Run: `pnpm --filter @repo/api test -- auth.module.spec.ts authentication.adapter.spec.ts scope.guard.spec.ts`

Expected: PASS for module wiring, authentication modes, and scope behavior.

- [ ] **Step 6: Commit common/auth extraction**

```bash
git add apps/api/src/common apps/api/src/auth apps/api/src/bootstrap.ts apps/api/src/saas
git commit -m "refactor(api): extract auth and common concerns"
```

### Task 3: Top-level organization, project, and audit modules

**Files:**

- Move every tracked file under `apps/api/src/saas/organizations/` into `apps/api/src/organizations/{application,domain,infrastructure,presentation}/` according to the design spec.
- Move every tracked file under `apps/api/src/saas/projects/` into `apps/api/src/projects/{application,domain,infrastructure,presentation}/`.
- Move every tracked file under `apps/api/src/saas/audit/` into `apps/api/src/audit/{application,domain,infrastructure,presentation}/`.
- Create: `apps/api/src/organizations/organizations.module.ts`
- Create: `apps/api/src/projects/projects.module.ts`
- Create: `apps/api/src/audit/audit.module.ts`
- Create: `apps/api/src/organizations/organizations.module.spec.ts`
- Create: `apps/api/src/projects/projects.module.spec.ts`
- Create: `apps/api/src/audit/audit.module.spec.ts`
- Modify moved imports and existing test paths.

**Interfaces:**

- `OrganizationsModule` exports `OrganizationPermissionGuard`, `OrganizationIdPipe`, `ORGANIZATION_MEMBERSHIP_STORE`, and `ORGANIZATION_PERMISSION_EVALUATOR`.
- `ProjectsModule` exports `ProjectService` and `PROJECT_MEMBERSHIP_STORE`.
- `AuditModule` exports `AuditService`, `AUDIT_STORE`, and `AUDIT_READ_STORE` only where another feature consumes them.
- All database factories inject `DATABASE_POOL`; none call `createDatabase`.

- [ ] **Step 1: Write failing feature-module compilation tests**

Each test creates a Nest testing module with `ConfigModule`, `DatabaseModule`, `AuthModule`, and the feature module under test, then resolves one public application service. For projects include `OrganizationsModule`; for audit include `OrganizationsModule`.

```ts
expect(module.get(OrganizationService)).toBeInstanceOf(OrganizationService)
expect(module.get(ProjectService)).toBeInstanceOf(ProjectService)
expect(module.get(AuditReadService)).toBeInstanceOf(AuditReadService)
```

- [ ] **Step 2: Run feature-module tests and verify the expected failure**

Run: `pnpm --filter @repo/api test -- organizations.module.spec.ts projects.module.spec.ts audit.module.spec.ts`

Expected: FAIL because the feature modules are absent.

- [ ] **Step 3: Move organization files and create `OrganizationsModule`**

Map controllers, DTOs, `OrganizationPermissionGuard`, and `OrganizationIdPipe` to `presentation`; services to `application`; store ports/tokens and business types to `domain`; database and in-memory stores to `infrastructure`. Move all organization provider factories from `SaasModule`, inject `DATABASE_POOL`, and preserve local seed memberships.

- [ ] **Step 4: Move project files and create `ProjectsModule`**

Apply the same mapping. Import `OrganizationsModule` for organization authorization, inject `DATABASE_POOL` into project store factories, preserve local project membership configuration, and export `ProjectService` for the global scope guard.

- [ ] **Step 5: Move audit files and create `AuditModule`**

Keep the shared in-memory read/write store as one singleton provider, choose PostgreSQL adapters when `DATABASE_POOL` exists, and preserve audit controller authorization through organization exports.

- [ ] **Step 6: Update all cross-feature imports through public feature paths**

Controllers may import domain types and exported presentation guards/pipes, but no feature may import another feature's `infrastructure` directory. Resolve any cycle by moving only genuinely cross-cutting request metadata into `common`.

- [ ] **Step 7: Run feature and behavior tests**

Run: `pnpm --filter @repo/api test -- organizations.module.spec.ts projects.module.spec.ts audit.module.spec.ts organization-permission.guard.spec.ts organization.service.spec.ts project.service.spec.ts audit-read.service.spec.ts audit.service.spec.ts`

Expected: PASS with no unresolved Nest providers or circular imports.

- [ ] **Step 8: Commit feature modules**

```bash
git add apps/api/src/organizations apps/api/src/projects apps/api/src/audit apps/api/src/saas
git commit -m "refactor(api): extract tenant feature modules"
```

### Task 4: Billing module grouping and task-safe billing behavior

**Files:**

- Move every tracked file under `apps/api/src/saas/billing/` into `apps/api/src/billing/{application,domain,infrastructure,presentation}/`.
- Recreate: `apps/api/src/billing/billing.module.ts`
- Create: `apps/api/src/billing/billing.module.spec.ts`
- Modify moved billing tests.
- Modify: `packages/billing/src/index.ts`

**Interfaces:**

- `BillingModule` imports `DatabaseModule` and `OrganizationsModule`.
- All PostgreSQL billing stores inject the shared `DATABASE_POOL`.
- `BillingProvider.createCustomer(input, idempotencyKey)` requires a stable key.
- Entitlement replacement accepts an explicit provider version and rejects stale writes.

- [ ] **Step 1: Add failing stable-customer-idempotency test**

```ts
it('uses one stable provider idempotency key per organization', async () => {
  await service.createCheckout({
    cancelUrl: 'https://app.example/cancel',
    organizationId: '00000000-0000-4000-8000-000000000001',
    planCode: 'starter-monthly',
    principal,
    requestId: 'request-1',
    successUrl: 'https://app.example/success',
  })

  expect(provider.createdCustomers).toEqual([
    {
      idempotencyKey: 'billing-customer:00000000-0000-4000-8000-000000000001',
      input: {
        organizationId: '00000000-0000-4000-8000-000000000001',
      },
    },
  ])
})
```

- [ ] **Step 2: Verify the customer test fails for the missing argument**

Run: `pnpm --filter @repo/api test -- billing.service.spec.ts`

Expected: FAIL because `createCustomer` does not receive a stable idempotency key.

- [ ] **Step 3: Update provider contracts and implementations**

Pass `billing-customer:${organizationId}` through disabled, local, and Stripe providers. The Stripe adapter supplies it in request options exactly as checkout creation already supplies its request idempotency key.

- [ ] **Step 4: Add failing stale-entitlement test**

Create `apps/api/src/billing/infrastructure/database-billing.store.integration.spec.ts`. Using the real PostgreSQL integration fixture, apply entitlements at `2026-08-23T12:00:00Z`, then attempt a conflicting replacement at `2026-08-23T11:00:00Z`. Assert the newer feature set remains unchanged.

- [ ] **Step 5: Verify stale entitlement behavior fails**

Run: `docker compose -p portable-backend-verification up -d postgres && DATABASE_RLS_TEST_URL=postgresql://app:local-postgres-password@localhost:5432/app pnpm --filter @repo/api test -- database-billing.store.integration.spec.ts`

Expected: FAIL because current replacement deletes newer entitlements.

- [ ] **Step 6: Implement account-locked, version-aware replacement**

Inside one transaction, lock the `billing_accounts` row with `FOR UPDATE`, compare the maximum existing `provider_updated_at`, return without changes when it is newer, then delete and insert the accepted projection atomically. In-memory behavior tracks the accepted version with the same rule.

- [ ] **Step 7: Group billing files and recreate `BillingModule`**

Controllers and DTOs go to `presentation`; services and projection processing to `application`; provider/repository/outbox contracts to `domain`; Stripe/local/disabled providers and database/in-memory stores to `infrastructure`. The module must not create a pool.

- [ ] **Step 8: Run billing module, unit, and integration tests**

Run: `pnpm --filter @repo/api test -- billing.module.spec.ts billing.service.spec.ts billing-worker.controller.spec.ts database-billing.store.spec.ts stripe-billing.provider.spec.ts`

Expected: PASS with stable customer idempotency and shared pool wiring.

- [ ] **Step 9: Commit billing module extraction**

```bash
git add apps/api/src/billing apps/api/src/saas packages/billing
git commit -m "refactor(api): isolate billing module"
```

### Task 5: Compose the modular API and delete `SaasModule`

**Files:**

- Create: `apps/api/src/app.module.spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/openapi.ts`
- Move: `apps/api/src/openapi.models.ts` response models into owning feature `presentation` DTO/model files.
- Delete: `apps/api/src/saas/saas.module.ts`
- Delete the empty `apps/api/src/saas/` directory.
- Modify: `apps/api/test/app.e2e.spec.ts`

**Interfaces:**

- `AppModule` directly imports every feature module and `DatabaseModule`.
- `APP_GUARD` providers remain ordered as throttling then scope authorization.
- OpenAPI operation IDs, paths, request schemas, and response schemas remain compatible.

- [ ] **Step 1: Write failing application composition test**

```ts
describe('AppModule', () => {
  it('composes top-level feature modules without SaasModule', async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()
    expect(module.get(AuthenticationService)).toBeInstanceOf(
      AuthenticationService,
    )
    expect(module.get(ProjectService)).toBeInstanceOf(ProjectService)
    expect(module.get(BillingService)).toBeInstanceOf(BillingService)
    await module.close()
  })
})
```

- [ ] **Step 2: Run the composition test and verify the expected failure**

Run: `pnpm --filter @repo/api test -- app.module.spec.ts`

Expected: FAIL while `AppModule` still depends on `SaasModule` or providers are not exported.

- [ ] **Step 3: Compose top-level modules and register the global guard**

Import `DatabaseModule`, `AuthModule`, `OrganizationsModule`, `ProjectsModule`, `AuditModule`, and `BillingModule`. Register the common `ScopeGuard` in `AppModule`, where exported `AuthenticationService` and `ProjectService` are visible.

- [ ] **Step 4: Move response models to owning features and update OpenAPI imports**

Health response stays under `health`; principal response belongs to auth presentation; project and membership responses belong to projects presentation. Keep Swagger decorators and schema names stable.

- [ ] **Step 5: Delete `SaasModule` and verify no `src/saas` references remain**

Run: `rg -n "src/saas|/saas/|SaasModule|SAAS_DATABASE_POOL" apps/api || true`

Expected: no output. This command is structural inspection; behavior remains covered by module and endpoint tests.

- [ ] **Step 6: Run the complete API suite and OpenAPI generation**

Run: `pnpm --filter @repo/api test && pnpm --filter @repo/api typecheck && pnpm openapi:generate`

Expected: PASS; generated OpenAPI includes the existing versioned routes.

- [ ] **Step 7: Commit modular API composition**

```bash
git add apps/api
git commit -m "refactor(api): compose modular monolith"
```

### Task 6: Replace SQS with a leased PostgreSQL job queue

**Files:**

- Create: `packages/database/migrations/0003_postgres_billing_jobs.sql`
- Create: `apps/worker/src/postgres-job.store.ts`
- Create: `apps/worker/src/postgres-job.store.spec.ts`
- Create: `apps/worker/src/postgres-job.store.integration.spec.ts`
- Create: `apps/worker/src/billing-job.runner.ts`
- Create: `apps/worker/src/billing-job.runner.spec.ts`
- Modify: `packages/billing/src/index.ts`
- Modify: `apps/worker/src/main.ts`
- Modify: `apps/worker/src/index.ts`
- Modify: `apps/worker/package.json`
- Modify: `apps/worker/Dockerfile`
- Delete: `apps/worker/src/sqs-outbox.publisher.ts`
- Delete: `apps/worker/src/sqs-outbox.publisher.spec.ts`
- Delete: `apps/worker/src/sqs-queue.consumer.ts`
- Delete: `apps/worker/src/sqs-queue.consumer.spec.ts`
- Delete: `apps/worker/src/local-http-outbox.publisher.ts`
- Replace or delete superseded outbox dispatcher/store files and tests.

**Interfaces:**

- Produces `BillingJobStore.claimBatch`, `extendLease`, `complete`, and `retryOrDead`.
- Produces `ClaimedBillingJob` with `id`, `leaseToken`, `attempts`, and `message`.
- Produces `BillingJobRunner.runOnce()` that processes claimed messages through an injected `BillingJobProcessor`.

- [ ] **Step 1: Write failing queue integration tests**

Create literal jobs and use two `PostgresBillingJobStore` instances against the same migrated PostgreSQL database. Assert:

```ts
expect(
  new Set([...firstClaims, ...secondClaims].map((job) => job.id)).size,
).toBe(firstClaims.length + secondClaims.length)
expect(await staleStore.complete(staleClaim)).toBe(false)
expect((await reclaimingStore.claimBatch(afterExpiry))[0]?.id).toBe(
  crashedJob.id,
)
expect(await deadStore.claimBatch(afterMaxAttempts)).toEqual([])
```

- [ ] **Step 2: Run queue tests and verify the expected failure**

Run: `docker compose -p portable-backend-verification up -d postgres && pnpm db:migrate && DATABASE_RLS_TEST_URL=postgresql://app:local-postgres-password@localhost:5432/app pnpm --filter @repo/worker test -- postgres-job.store.integration.spec.ts`

Expected: FAIL because migration `0003` and the final job-store interface do not exist.

- [ ] **Step 3: Add the append-only billing job migration**

Add `completed_at` and `dead_at`, backfill `completed_at` from historical `sent_at`/`dispatched_at`, retain attempts/error/lease fields, and add a partial availability index over unfinished, non-dead jobs. Do not alter migration `0002`.

- [ ] **Step 4: Implement atomic PostgreSQL job claims**

Use a CTE that selects eligible IDs ordered by creation time with `FOR UPDATE SKIP LOCKED`, then updates lease token, lease expiry, and attempts in the same statement. Completion, extension, and retry/dead updates include `WHERE id = $1 AND lease_token = $2 AND completed_at IS NULL AND dead_at IS NULL`.

- [ ] **Step 5: Verify queue-store integration behavior passes**

Run: `DATABASE_RLS_TEST_URL=postgresql://app:local-postgres-password@localhost:5432/app pnpm --filter @repo/worker test -- postgres-job.store.integration.spec.ts`

Expected: PASS for disjoint claims, lease recovery, stale-token rejection, and dead jobs.

- [ ] **Step 6: Write failing runner tests**

Use a real in-memory fake implementing the complete `BillingJobStore` interface. Assert successful processing calls `complete`, failure calls `retryOrDead`, and a long-running processor receives periodic `extendLease` calls before completion.

- [ ] **Step 7: Implement `BillingJobRunner` and direct worker polling**

The runner claims a bounded batch, starts a lease heartbeat for each active job, processes through `HttpBillingProcessor`, clears the heartbeat, then completes or retries. `main.ts` loops with validated `BILLING_JOB_POLL_MS`, `BILLING_JOB_BATCH_SIZE`, `BILLING_JOB_LEASE_MS`, and `BILLING_JOB_MAX_ATTEMPTS`. Reuse one worker pool and close it on termination signals.

Emit structured JSON for claim failures, retries, and dead jobs with job ID, attempt, next retry time, and error message. Do not log webhook bodies, payment payloads, credentials, or worker secrets.

- [ ] **Step 8: Remove SQS adapters and dependency**

Remove `@aws-sdk/client-sqs` from the worker and catalog after no workspace consumes it. Delete SQS-specific tests and imports. Preserve the authenticated HTTP boundary between worker and API.

- [ ] **Step 9: Run worker and database suites**

Run: `pnpm --filter @repo/worker test && pnpm --filter @repo/worker typecheck && pnpm --filter @repo/database test`

Expected: PASS with no AWS SDK import in worker output.

- [ ] **Step 10: Commit the portable job queue**

```bash
git add packages/billing packages/database apps/worker pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "refactor(worker): use postgres billing jobs"
```

### Task 7: Generate the API client without committed artifacts

**Files:**

- Create: `scripts/generate-api-client.mjs`
- Modify: `apps/api/scripts/generate-openapi.ts`
- Modify: `packages/api-client/package.json`
- Modify: `package.json`
- Modify: `turbo.json`
- Modify: `.gitignore`
- Modify: `.github/workflows/ci.yml`
- Modify: `apps/web/Dockerfile`
- Modify: `apps/api/Dockerfile` only if portable database build inputs require it.
- Delete from Git: `packages/api-client/openapi.json`
- Delete from Git: `packages/api-client/src/generated/schema.ts`

**Interfaces:**

- Produces root command `pnpm api-client:generate`.
- `apps/api/scripts/generate-openapi.ts` accepts `--output /absolute/or/repo/relative/path`.
- `packages/api-client` continues exporting its hand-written root, server, and browser modules after generation.

- [ ] **Step 1: Prove the current clean-artifact build fails**

Move the two tracked generated artifacts to a temporary directory outside the repository, then run `pnpm --filter @repo/api-client typecheck`.

Expected: FAIL because `src/generated/schema.ts` is missing. Restore the files before editing so the baseline remains recoverable.

- [ ] **Step 2: Add output-aware OpenAPI generation and root orchestration**

`generate-openapi.ts` resolves the explicit `--output` argument and creates its parent directory. `scripts/generate-api-client.mjs` runs the API OpenAPI command followed by the api-client generator, forwarding child exit codes and using only repository-relative paths.

- [ ] **Step 3: Add generation to developer and CI entrypoints**

Define:

```json
{
  "api-client:generate": "node scripts/generate-api-client.mjs",
  "build": "pnpm api-client:generate && turbo run build",
  "check": "pnpm api-client:generate && turbo run lint typecheck test build",
  "dev": "pnpm api-client:generate && turbo run dev"
}
```

Keep `openapi:generate` as the lower-level API snapshot command. Remove CI's Git drift check and rely on fresh generation followed by the full check.

- [ ] **Step 4: Generate before Turbo pruning in the web image**

Copy the API, database, billing, and api-client manifests needed for installation, copy the full repository, run `pnpm api-client:generate`, then run `turbo prune @repo/web --docker`. The builder stage consumes the generated files included in the pruned api-client workspace.

- [ ] **Step 5: Remove generated artifacts from Git and ignore them**

Add exact ignore entries for `/packages/api-client/openapi.json` and `/packages/api-client/src/generated/`. Do not ignore hand-written package files.

- [ ] **Step 6: Verify generation from an artifact-free checkout state**

Run: `pnpm api-client:generate && pnpm --filter @repo/api-client typecheck && pnpm --filter @repo/web build && git status --short`

Expected: commands PASS and generated artifacts do not appear in `git status`.

- [ ] **Step 7: Commit generated-client lifecycle**

```bash
git add .github/workflows/ci.yml .gitignore package.json turbo.json scripts apps/api/scripts apps/web/Dockerfile packages/api-client pnpm-lock.yaml
git commit -m "build: generate api client per release"
```

### Task 8: Remove SQS infrastructure and make deployment inputs portable

**Files:**

- Modify: `compose.yml`
- Modify: `apps/infra/lib/application-stack.ts`
- Modify: `apps/infra/test/application-stack.test.ts`
- Modify: `apps/infra/.env.example`
- Modify: `apps/worker/.env.example` if absent/create it with portable worker variables.
- Modify: `apps/api/.env.example`
- Delete: `scripts/localstack-init.sh`
- Modify: `.dockerignore` only if deleted LocalStack assets are referenced.

**Interfaces:**

- Compose requires PostgreSQL only; no AWS credentials or LocalStack service.
- AWS tasks receive standard `PG*` variables and portable billing job variables.
- CDK contains zero `AWS::SQS::Queue` resources.
- API deployment stabilizes before web, and web stabilizes before worker.

- [ ] **Step 1: Update failing infrastructure expectations first**

Change the CDK test to assert:

```ts
template.resourceCountIs('AWS::SQS::Queue', 0)
expect(workerEnvironment).toEqual(
  expect.arrayContaining([
    { Name: 'BILLING_JOB_POLL_MS', Value: '1000' },
    { Name: 'PGDATABASE', Value: 'app' },
  ]),
)
```

Also assert the worker task has no `BILLING_SQS_QUEUE_URL`, `AWS_REGION`, or `ASYNC_QUEUE_URL` entry.

- [ ] **Step 2: Run infra tests and verify the expected failure**

Run: `pnpm --filter @repo/infra test`

Expected: FAIL because the stack still creates SQS resources and variables.

- [ ] **Step 3: Remove SQS from CDK and configure portable database variables**

Remove queue/DLQ resources, IAM grants, queue scaling, and queue alarms. Inject RDS endpoint and secret fields as `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, and `PGSSLMODE`. Keep worker-to-API networking and `WORKER_SECRET`. Use CPU-based worker scaling or a fixed desired count without broker-specific metrics.

- [ ] **Step 4: Express coordinated service update dependencies**

Add construct dependencies so API updates precede web updates and web updates precede worker updates. Keep the migration task definition output and document that operators run it before the stack rollout.

- [ ] **Step 5: Remove LocalStack from Compose**

Delete the LocalStack service, AWS test credentials, queue URL, adapter mode, and initialization mount. Configure the worker with its PostgreSQL URL, internal API URL, shared secret, and job lease/retry variables.

- [ ] **Step 6: Run CDK and Compose configuration verification**

Run: `pnpm --filter @repo/infra test && pnpm --filter @repo/infra synth -c certificateArn=arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-0000-0000-000000000000 -c domainName=app.example.com -c hostedZoneId=Z0123456789ABCDEF -c hostedZoneName=example.com && docker compose config`

Expected: PASS, no SQS resources in synthesis, and no LocalStack/AWS credential requirement in Compose.

- [ ] **Step 7: Commit portable deployment adapters**

```bash
git add compose.yml apps/infra apps/api/.env.example apps/worker scripts/localstack-init.sh
git commit -m "refactor(infra): remove runtime aws queue dependency"
```

### Task 9: Document the architecture and perform full acceptance verification

**Files:**

- Modify: `README.md`
- Modify: `.github/pull_request_template.md` only if its verification list needs generated-client wording.
- Modify tests or configuration only when fresh acceptance evidence identifies a real defect.

**Interfaces:**

- README documents module ownership, common-folder rules, database lifecycle, migrations, RLS, PostgreSQL jobs, client generation, rollout order, portability, and microservice extraction criteria.
- Final verification produces clean evidence for the root orchestrator and fresh reviewer.

- [ ] **Step 1: Update README with exact operator flows**

Include these commands and guarantees:

```bash
docker compose up --build --wait
pnpm db:migrate
pnpm api-client:generate
pnpm check
pnpm format:check
```

State that generated files are ignored, PostgreSQL jobs use expiring leases and dead-job state, each task owns a bounded pool, `apps/infra` is optional AWS deployment code, and deployments run migration then API then web then worker.

- [ ] **Step 2: Run targeted PostgreSQL integration tests**

Run: `docker compose -p portable-backend-verification up -d postgres && pnpm db:migrate && DATABASE_RLS_TEST_URL=postgresql://app:local-postgres-password@localhost:5432/app pnpm --filter @repo/database test && DATABASE_RLS_TEST_URL=postgresql://app:local-postgres-password@localhost:5432/app pnpm --filter @repo/api test -- database-billing.store.integration.spec.ts && DATABASE_RLS_TEST_URL=postgresql://app:local-postgres-password@localhost:5432/app pnpm --filter @repo/worker test -- postgres-job.store.integration.spec.ts`

Expected: PASS for tenant RLS and concurrent billing jobs.

- [ ] **Step 3: Run mandatory repository checks**

Run: `pnpm check`

Expected: exit 0 for lint, typecheck, tests, and builds across every workspace.

Run: `pnpm format:check`

Expected: exit 0 with all files matching Prettier formatting.

- [ ] **Step 4: Build and smoke-test the portable container stack**

Run: `docker compose -p portable-backend-verification up --build --wait --wait-timeout 180`

Then run:

```bash
curl --fail http://localhost:3001/api/v1/health
curl --fail http://localhost:3000/health
test "$(curl --silent --output /dev/null --write-out '%{http_code}' http://localhost:3001/api/v1/me)" = '401'
curl --fail http://localhost:3001/api/docs | grep -q 'swagger-ui-bundle.js'
```

Expected: every command exits 0 with API, web, Swagger, and authentication behavior intact.

- [ ] **Step 5: Inspect generated-artifact and AWS-runtime boundaries**

Run:

```bash
git status --short
git ls-files packages/api-client/openapi.json packages/api-client/src/generated/schema.ts
rg -n "@aws-sdk/client-sqs|BILLING_SQS_QUEUE_URL|ASYNC_QUEUE_URL|DATABASE_SECRET|LocalStack|SaasModule|SAAS_DATABASE_POOL" apps packages compose.yml package.json pnpm-workspace.yaml || true
git diff --check
```

Expected: generated artifact listing is empty; restricted runtime symbols produce no output; diff check exits 0.

- [ ] **Step 6: Stop the verification stack without deleting user data outside this project**

Run: `docker compose -p portable-backend-verification down --volumes --remove-orphans`

Expected: only this Compose project's containers, network, and named test volume are removed.

- [ ] **Step 7: Commit documentation and final test corrections**

```bash
git add README.md .github apps packages compose.yml package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json scripts
git commit -m "docs: explain portable backend operations"
```

- [ ] **Step 8: Return structured implementation evidence**

Report every commit, changed-file scope, exact verification command and exit result, TDD red/green evidence, judgment calls, and any remaining gap. A successful report must state that `pnpm check`, `pnpm format:check`, PostgreSQL integration tests, container smoke tests, `git diff --check`, and generated-artifact inspection all passed.

### Task 10: Final-review corrections for a migration-gated, cloud-neutral release

**Files:**

- Modify: `packages/database/src/connection-string.ts`
- Modify: `packages/database/test/connection-string.test.ts`
- Modify: `apps/api/src/env.ts`
- Modify: `apps/api/src/billing/domain/billing-outbox.ts`
- Modify: `apps/api/src/billing/infrastructure/database-billing.store.ts`
- Modify: relevant API billing tests
- Modify: `packages/database/migrations/0004_billing_entitlement_projection_versions.sql`
- Modify: `apps/worker/src/postgres-job.store.ts`
- Modify: `apps/worker/src/worker.ts`
- Modify: relevant worker tests
- Modify: `apps/api/Dockerfile`
- Modify: `apps/worker/Dockerfile`
- Modify: `apps/infra/lib/fullstack-stack.ts`
- Modify: `apps/infra/test/fullstack-stack.test.ts`
- Modify: `README.md`

**Interfaces:**

- Generic Docker targets are AWS-neutral; explicit `aws-runner` targets add the RDS CA bundle for CDK only.
- Every ECS API task runs the migration command in a nonessential init container, and the API container starts only after ECS reports that container exited successfully.
- PostgreSQL SSL parsing accepts `disable`, `require`, `verify-ca`, and `verify-full`, plus `PGSSLROOTCERT`.
- Queue cleanup can terminally mark every exhausted unfinished row, including pre-release rows with a null lease expiry.
- Worker shutdown and job finalization wait for an active heartbeat and log only state transitions that actually occurred.
- The API billing outbox is enqueue-only; no obsolete `take()`/`dispatched_at` consumer path remains.

- [ ] **Step 1: Write failing SSL, queue, worker, Docker, and CDK tests**

Cover `PGSSLMODE=verify-full` with a root certificate, exhausted jobs whose lease expiry is null, an active heartbeat during finalization, a false token-guarded retry result, absence of the API `take()` path, generic image neutrality, and the ECS migration-container `SUCCESS` dependency.

- [ ] **Step 2: Verify each new test fails for the intended reason**

Run the narrow package tests before implementation and retain the red evidence.

- [ ] **Step 3: Complete the pre-release entitlement baseline**

Keep migration `0004` append-only. Initialize the entitlement projection version for every existing billing account, using the newest entitlement version when present and a conservative current watermark otherwise. Insert an idempotent `billing.reconcile` job for each existing billing account so local or seeded pre-release data refreshes from authoritative provider state.

- [ ] **Step 4: Fix PostgreSQL SSL and terminal queue behavior**

Accept the standard verified SSL modes and `PGSSLROOTCERT` consistently in package and Nest environment validation. Make exhausted unfinished jobs terminal when they are not actively leased, including rows with `lease_expires_at IS NULL`.

- [ ] **Step 5: Make heartbeat/finalization ordering and logs truthful**

Track the active lease-extension promise, stop scheduling extensions, and await the active extension before complete, retry, or return. Emit retry/dead logs only when the token-guarded update succeeds, and emit a structured terminal-state log for exhausted cleanup.

- [ ] **Step 6: Remove the obsolete API outbox-consumer surface**

Delete `BillingOutbox.take()`, its database implementation, and tests or fixtures that rely on `dispatched_at`. The API inserts jobs; only the worker claims them.

- [ ] **Step 7: Separate generic and AWS image targets**

Keep the default `runner` targets free of AWS network downloads and trust assets. Add explicit `aws-runner` targets that layer in the RDS CA bundle. Configure CDK assets to build `aws-runner`; Compose and ordinary `docker build` continue to use `runner`.

- [ ] **Step 8: Enforce the migration gate in each ECS API task**

Add a nonessential migration init container using the same API image, command it to run the database migration entrypoint, and add an ECS container dependency with condition `SUCCESS` to the API container. Preserve API -> web -> worker service update ordering. Test the synthesized task definition, not only construct dependencies.

- [ ] **Step 9: Update operations documentation**

Document the pre-release baseline, first-deploy behavior, advisory-lock safety when several API tasks initialize concurrently, expand/contract requirements after the first release, generic versus AWS image targets, and the bounded connection budget.

- [ ] **Step 10: Run full acceptance**

Run package tests, `pnpm check`, `pnpm format:check`, fresh-volume migrations and PostgreSQL integration tests, generic Compose builds and smoke tests, AWS-target builds, CDK tests and synthesis, generated-artifact inspection, forbidden-symbol scans, `git diff --check`, and scoped teardown. Verify generic images contain no RDS CA bundle or AWS download dependency and AWS targets do contain the configured CA bundle.
