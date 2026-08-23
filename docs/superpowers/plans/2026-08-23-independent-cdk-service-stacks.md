# Independent CDK Service Stacks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the monolithic AWS application stack with a shared foundation, independently deployable API and worker stacks, and an opinionated reusable Fargate service construct while removing the AWS-hosted web service.

**Architecture:** `app.ts` composes `FoundationStack`, `ApiStack`, and `WorkerStack`; API and worker depend only on foundation and never on each other. Focused service modules own database bindings, access control, Fargate configuration, domains, and monitoring, while repository-internal constructs encapsulate repeated Docker asset and ECS/ALB mechanics.

**Tech Stack:** TypeScript, AWS CDK v2, ECS Fargate, Application Load Balancer, Route 53, ACM, WAFv2, RDS PostgreSQL, CloudWatch, Vitest, pnpm, Turbo

**Spec:** `docs/superpowers/specs/2026-08-23-independent-cdk-service-stacks-design.md`

## Global Constraints

- Keep deployable services under `apps/` and reusable code under `packages/`; the CDK-only reusable constructs remain internal to `apps/infra/lib/constructs`.
- API and worker stacks may depend on `foundation-stack` but must not depend on one another.
- Stack construct IDs are exactly `foundation-stack`, `api-stack`, and `worker-stack`.
- Preserve Linux x86_64 Fargate, one-month logs, circuit-breaker rollback, ECS Exec, and current scaling values.
- Preserve API pool maximum `4`, worker pool maximum `2`, migration pool maximum `1`, PostgreSQL TLS `verify-full`, and the RDS global bundle path.
- Preserve the API same-image migration init gate and standalone migration task.
- Remove only AWS web infrastructure; do not modify `apps/web` or Docker Compose behavior.
- Do not add CodePipeline, CodeBuild, GitHub connections, or deployment automation.
- Require `domainName` for the AWS API hostname and `webOrigin` for `CORS_ORIGIN`.
- Create the delegated Route 53 API hosted zone in foundation and its DNS-validated certificate and alias in API.
- Do not require live AWS lookups or credentials during synthesis.
- Before handoff, run `pnpm check` and `pnpm format:check` plus the focused infra and synthesis gates.

---

### Task 1: Shared validation and foundation stack

**Files:**

- Create: `apps/infra/lib/config.ts`
- Create: `apps/infra/lib/foundation/network.ts`
- Create: `apps/infra/lib/foundation/access-control.ts`
- Create: `apps/infra/lib/foundation/database.ts`
- Create: `apps/infra/lib/foundation/domain.ts`
- Create: `apps/infra/lib/foundation/shared-resources.ts`
- Create: `apps/infra/lib/foundation/stack.ts`
- Create: `apps/infra/test/foundation-stack.test.ts`

**Interfaces:**

- Produces `validateProjectName(projectName: string): void` and `MAX_PROJECT_NAME_LENGTH` from `lib/config.ts`.
- Produces `FoundationStackProps extends cdk.StackProps` with `alarmEmail?: string`, `domainName: string`, and `projectName: string`.
- Produces public readonly `FoundationStack` properties: `alarmTopic`, `apiSecurityGroup`, `cluster`, `database`, `hostedZone`, `vpc`, `workerSecurityGroup`, and `workerSecret`.
- Produces a Cloud Map namespace named `${projectName}.local` and a public hosted zone named exactly `domainName`.
- API and worker tasks consume the foundation security groups, avoiding service-to-service stack references.

- [ ] **Step 1: Write failing foundation tests**

Create assertions that instantiate `FoundationStack` and require one VPC, one ECS cluster, one RDS instance, the API/worker/database security groups, one worker secret, one SNS topic, one Route 53 hosted zone, and zero ECS services or load balancers. Preserve the existing RDS assertions:

```ts
template.hasResourceProperties('AWS::RDS::DBInstance', {
  BackupRetentionPeriod: 14,
  DeletionProtection: true,
  MultiAZ: true,
  PubliclyAccessible: false,
  StorageEncrypted: true,
})
template.resourceCountIs('AWS::ECS::Service', 0)
template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 0)
template.resourceCountIs('AWS::Route53::HostedZone', 1)
```

Test valid and invalid project names through `validateProjectName`.

- [ ] **Step 2: Run the focused test and observe failure**

Run: `pnpm --filter @repo/infra test -- foundation-stack.test.ts`

Expected: FAIL because the foundation modules do not exist.

- [ ] **Step 3: Implement shared validation and foundation resources**

Move the name regex and constant from `application-stack.ts` into `config.ts`. Build the VPC/cluster/namespace in `network.ts`; create dedicated API, worker, and database security groups plus worker-to-API and both service-to-database ingress in `access-control.ts`; create the RDS instance and rotation in `database.ts`; create the delegated public hosted zone in `domain.ts`; and create the shared worker secret and alarm topic/subscription in `shared-resources.ts`.

Compose them in `FoundationStack` in dependency order and expose resources as readonly properties:

```ts
export class FoundationStack extends cdk.Stack {
  readonly alarmTopic: sns.ITopic
  readonly apiSecurityGroup: ec2.ISecurityGroup
  readonly cluster: ecs.ICluster
  readonly database: rds.IDatabaseInstance
  readonly hostedZone: route53.IHostedZone
  readonly vpc: ec2.IVpc
  readonly workerSecurityGroup: ec2.ISecurityGroup
  readonly workerSecret: secretsmanager.ISecret
}
```

Add foundation outputs for hosted-zone name servers, database secret ARN, cluster name, private subnet IDs, and service security-group IDs.

- [ ] **Step 4: Run foundation tests**

Run: `pnpm --filter @repo/infra test -- foundation-stack.test.ts`

Expected: PASS with no ECS service or ALB in the foundation template.

- [ ] **Step 5: Commit the foundation**

```sh
git add apps/infra/lib/config.ts apps/infra/lib/foundation apps/infra/test/foundation-stack.test.ts
git commit -m "refactor(infra): add shared foundation stack"
```

### Task 2: Reusable container image and Fargate service constructs

**Files:**

- Create: `apps/infra/lib/constructs/container-image.ts`
- Create: `apps/infra/lib/constructs/fargate-service.ts`
- Create: `apps/infra/test/fargate-service.test.ts`

**Interfaces:**

- Produces `createRepositoryImage(options)` accepting `dockerfile`, optional `target`, and optional `repoRoot`, returning `ecs.ContainerImage` configured for `linux/amd64` with the shared ignore list.
- Produces `FargateService` with public `container`, `service`, `taskDefinition`, optional `loadBalancer`, and optional `targetGroup`.
- `FargateServiceProps` accepts foundation `cluster` and `securityGroups`, primary `container` options, optional dependency containers, scaling limits, Cloud Map name, and optional `publicLoadBalancer` certificate/port/health-check settings.
- The construct contains no API, worker, PostgreSQL, billing, auth, DNS, WAF, or alarm policy.

- [ ] **Step 1: Write failing reusable-construct tests**

Create a minimal test stack with a VPC and cluster. Instantiate one internal service and one public service. Assert both use x86_64 Linux task definitions, circuit breakers, ECS Exec, and scaling; assert only the public service creates an ALB, HTTP redirect listener, HTTPS listener, and target group.

```ts
expect(Object.values(taskDefinitions)).toHaveLength(2)
template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1)
template.hasResourceProperties('AWS::ECS::Service', {
  DeploymentConfiguration: Match.objectLike({
    DeploymentCircuitBreaker: { Enable: true, Rollback: true },
  }),
  EnableExecuteCommand: true,
})
```

- [ ] **Step 2: Run the focused test and observe failure**

Run: `pnpm --filter @repo/infra test -- fargate-service.test.ts`

Expected: FAIL because the constructs do not exist.

- [ ] **Step 3: Implement the shared constructs**

Centralize the current repository-root calculation, exclusions, ignore mode, platform, Dockerfile, and target in `container-image.ts`.

In `fargate-service.ts`, create the task definition, optional dependency containers, primary container, dependencies, port mapping, ECS service, target-tracking scaling, and optional ALB/listeners/target group. Use an explicit `AWS::EC2::SecurityGroupIngress` owned by the service stack when allowing the ALB security group into a foundation-owned service security group, preventing a reverse stack dependency.

Use these primary property shapes:

```ts
export interface DependencyContainerOptions {
  condition: ecs.ContainerDependencyCondition
  id: string
  options: ecs.ContainerDefinitionOptions
}

export interface PublicLoadBalancerOptions {
  certificate: acm.ICertificate
  containerPort: number
  healthCheckPath: string
}
```

- [ ] **Step 4: Run reusable-construct tests and typecheck**

Run: `pnpm --filter @repo/infra test -- fargate-service.test.ts && pnpm --filter @repo/infra typecheck`

Expected: PASS; TypeScript accepts both internal and public configurations.

- [ ] **Step 5: Commit the reusable constructs**

```sh
git add apps/infra/lib/constructs apps/infra/test/fargate-service.test.ts
git commit -m "refactor(infra): add reusable Fargate service construct"
```

### Task 3: Focused API stack

**Files:**

- Create: `apps/infra/lib/api/database.ts`
- Create: `apps/infra/lib/api/domain.ts`
- Create: `apps/infra/lib/api/fargate-service.ts`
- Create: `apps/infra/lib/api/access-control.ts`
- Create: `apps/infra/lib/api/monitoring.ts`
- Create: `apps/infra/lib/api/stack.ts`
- Create: `apps/infra/test/api-stack.test.ts`

**Interfaces:**

- `ApiStackProps` extends `cdk.StackProps` with the foundation resource properties, `domainName`, `projectName`, `webOrigin`, optional application secret ARN, optional alarm settings through foundation, and optional OIDC values.
- `createDatabaseBindings(database)` returns the standard `PG*` environment and Secrets Manager mappings.
- `createApiService(...)` returns the reusable `FargateService` plus the standalone migration task.
- `createApiCertificate(...)` runs before the Fargate service; `createApiAlias(...)` runs after the ALB exists.
- `createApiAccessControl(...)` attaches the existing WAF rules to the API ALB.
- `createApiMonitoring(...)` creates exactly two alarms and one API dashboard.

- [ ] **Step 1: Write failing API stack tests**

Port the API-specific assertions from `application-stack.test.ts` and require:

- two task definitions: API and standalone migration;
- one ECS service with desired count two and scaling minimum two;
- one Docker image asset targeting `aws-runner`;
- API container environment containing `CORS_ORIGIN=webOrigin`, pool max `4`, and TLS settings;
- migration init dependency with pool max `1`;
- HTTPS and redirect listeners, API target health check, WAF, ACM certificate, Route 53 alias, two alarms, and one dashboard;
- no worker environment marker and no web container/image.

Add tests for incomplete OIDC configuration and missing `webOrigin`/`domainName` validation at the composition boundary.

- [ ] **Step 2: Run the API test and observe failure**

Run: `pnpm --filter @repo/infra test -- api-stack.test.ts`

Expected: FAIL because `ApiStack` does not exist.

- [ ] **Step 3: Implement API database and domain modules**

Move the PostgreSQL environment/secrets and migration task/init-container configuration into `api/database.ts`. Create the regional DNS-validated ACM certificate and the ALB alias in `api/domain.ts` using the foundation hosted zone.

The API environment must include:

```ts
{
  CORS_ORIGIN: props.webOrigin,
  DATABASE_POOL_MAX: '4',
  NODE_ENV: 'production',
  PGDATABASE: 'app',
  PGSSLMODE: 'verify-full',
  PGSSLROOTCERT: '/etc/ssl/certs/rds-global-bundle.pem',
  PORT: '3001',
}
```

- [ ] **Step 4: Implement API service, access control, and monitoring**

Build the API `aws-runner` asset, add the migration init container with `SUCCESS` dependency, invoke the shared construct with public HTTPS ingress, and create the standalone migration task. Recreate the WAF rate and AWS managed rules. Recreate the API target-5xx and database CPU alarms against the shared SNS topic, plus the API/ALB/database dashboard.

The ALB default target is the API on port 3001; remove the old web service and `/api/*` listener-rule indirection.

- [ ] **Step 5: Compose `ApiStack` and run tests**

Run: `pnpm --filter @repo/infra test -- api-stack.test.ts && pnpm --filter @repo/infra typecheck`

Expected: PASS with one API service, two API-owned task definitions, no worker task, and no web asset.

- [ ] **Step 6: Commit the API stack**

```sh
git add apps/infra/lib/api apps/infra/test/api-stack.test.ts
git commit -m "refactor(infra): split API deployment stack"
```

### Task 4: Focused worker stack

**Files:**

- Create: `apps/infra/lib/worker/access-control.ts`
- Create: `apps/infra/lib/worker/database.ts`
- Create: `apps/infra/lib/worker/fargate-service.ts`
- Create: `apps/infra/lib/worker/monitoring.ts`
- Create: `apps/infra/lib/worker/stack.ts`
- Create: `apps/infra/test/worker-stack.test.ts`

**Interfaces:**

- `WorkerStackProps` extends `cdk.StackProps` with foundation cluster, database, security group, VPC-derived settings, worker secret, and `projectName`.
- `createWorkerDatabaseBindings(database)` returns the worker's standard `PG*` environment and Secrets Manager mappings.
- `createWorkerService(...)` returns the reusable `FargateService` without load-balancer options.
- `createWorkerMonitoring(...)` creates one worker operations dashboard and no new alarms.
- Worker files import no API-stack module or API-stack resource.

- [ ] **Step 1: Write failing worker stack tests**

Require one task definition, one ECS service with desired count one, scaling range one to four, one `aws-runner` worker Docker asset, and the exact existing billing/database environment. Assert zero ALBs, listeners, target groups, WAFs, certificates, hosted zones, RDS instances, and API containers.

Assert the URL remains:

```ts
{
  Name: 'BILLING_PROCESSOR_URL',
  Value: 'http://api.fullstack-app.local:3001/api/v1/internal/billing/jobs',
}
```

- [ ] **Step 2: Run the worker test and observe failure**

Run: `pnpm --filter @repo/infra test -- worker-stack.test.ts`

Expected: FAIL because `WorkerStack` does not exist.

- [ ] **Step 3: Implement worker modules**

Create the worker-specific PostgreSQL environment and secret maps in `worker/database.ts`. Use the shared image helper with `apps/worker/Dockerfile` and `aws-runner`. Use the shared Fargate construct with one desired task, CPU autoscaling from one to four, no port, no Cloud Map registration, and no public load balancer. Bind the foundation worker secret and worker security group. Keep the access-control module focused on worker-specific network bindings and create a CPU/database visibility dashboard without adding unapproved alarm policy.

- [ ] **Step 4: Run worker tests and dependency inspection**

Run: `pnpm --filter @repo/infra test -- worker-stack.test.ts && pnpm --filter @repo/infra typecheck`

Expected: PASS; `WorkerStack` imports no file from `lib/api`.

Inspect: `rg -n "lib/api|ApiStack" apps/infra/lib/worker`

Expected: no matches.

- [ ] **Step 5: Commit the worker stack**

```sh
git add apps/infra/lib/worker apps/infra/test/worker-stack.test.ts
git commit -m "refactor(infra): split worker deployment stack"
```

### Task 5: Compose the CDK app and remove the legacy stack

**Files:**

- Create: `apps/infra/app.ts`
- Modify: `apps/infra/cdk.json`
- Modify: `apps/infra/package.json`
- Modify: `apps/infra/tsconfig.json`
- Delete: `apps/infra/bin/infra.ts`
- Delete: `apps/infra/lib/application-stack.ts`
- Delete: `apps/infra/test/application-stack.test.ts`
- Create: `apps/infra/test/app.test.ts`

**Interfaces:**

- The CDK app command becomes `pnpm exec tsx app.ts`.
- Stack construct IDs are exact literals: `foundation-stack`, `api-stack`, and `worker-stack`.
- Physical stack names are `${projectName}-foundation`, `${projectName}-api`, and `${projectName}-worker`.
- App context requires `domainName` and `webOrigin`; `projectName` defaults to `fullstack-app` through `cdk.json`.
- API and worker both depend on foundation, and neither depends on the other.

- [ ] **Step 1: Write failing app-composition tests**

Extract context-to-props parsing into exported side-effect-free functions in `app.ts` or `lib/config.ts` so tests can verify required context and partial OIDC failure without executing the CLI. Instantiate the app and assert stack IDs and dependencies:

```ts
expect(apiStack.dependencies).toContain(foundationStack)
expect(workerStack.dependencies).toContain(foundationStack)
expect(apiStack.dependencies).not.toContain(workerStack)
expect(workerStack.dependencies).not.toContain(apiStack)
```

- [ ] **Step 2: Run the app test and observe failure**

Run: `pnpm --filter @repo/infra test -- app.test.ts`

Expected: FAIL because `app.ts` and the composition interface do not exist.

- [ ] **Step 3: Implement `app.ts` and tooling changes**

Read context, validate domain/web origin/OIDC settings, instantiate foundation first, pass only foundation resources to API and worker, add explicit foundation dependencies, and call `app.synth()`.

Update:

```json
{
  "app": "pnpm exec tsx app.ts"
}
```

Change infra lint inputs to `eslint app.ts lib test --max-warnings=0`; change TypeScript includes to `app.ts`, `lib/**/*.ts`, and `test/**/*.ts`.

- [ ] **Step 4: Remove legacy files and run the full infra suite**

Delete the old entrypoint, monolithic stack, and monolithic test only after the new app tests pass.

Run: `pnpm --filter @repo/infra test && pnpm --filter @repo/infra lint && pnpm --filter @repo/infra typecheck && pnpm --filter @repo/infra build`

Expected: all commands pass and no source imports `application-stack` or `bin/infra`.

- [ ] **Step 5: Verify individual and all-stack synthesis**

Run:

```sh
pnpm --filter @repo/infra synth foundation-stack -c domainName=api.fullstack-template.com -c webOrigin=https://app.fullstack-template.com
pnpm --filter @repo/infra synth api-stack -c domainName=api.fullstack-template.com -c webOrigin=https://app.fullstack-template.com
pnpm --filter @repo/infra synth worker-stack -c domainName=api.fullstack-template.com -c webOrigin=https://app.fullstack-template.com
pnpm --filter @repo/infra synth -c domainName=api.fullstack-template.com -c webOrigin=https://app.fullstack-template.com
```

Expected: each named stack synthesizes; `--all` contains three stack templates and does not access live AWS APIs.

- [ ] **Step 6: Commit app composition and legacy removal**

```sh
git add apps/infra/app.ts apps/infra/cdk.json apps/infra/package.json apps/infra/tsconfig.json apps/infra/bin/infra.ts apps/infra/lib/application-stack.ts apps/infra/test
git commit -m "refactor(infra): compose independent CDK stacks"
```

### Task 6: Deployment documentation and CI synthesis

**Files:**

- Modify: `README.md`
- Modify: `apps/infra/.env.example`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/superpowers/specs/2026-08-23-independent-cdk-service-stacks-design.md`

**Interfaces:**

- README documents Vercel frontend hosting, delegated API DNS, two-phase first deployment, exact stack commands, and billable AWS resources.
- CI synthesis supplies only `domainName` and `webOrigin`; it no longer supplies certificate or existing hosted-zone context.
- Documentation does not claim CodePipeline or automatic production deployment exists.

- [ ] **Step 1: Update CI synthesis and environment documentation**

Replace the production synthesis command with:

```sh
pnpm --filter @repo/infra synth \
  -c domainName=api.example.com \
  -c webOrigin=https://app.example.com
```

Document `DOMAIN_NAME`, `WEB_ORIGIN`, optional Stripe/OIDC/alarm values, and the fact that CDK context is passed with `-c` rather than sourced automatically from `.env.example`.

- [ ] **Step 2: Rewrite the README AWS deployment section**

Explain:

1. Deploy foundation.
2. Copy its four Route 53 name servers into an NS record for the API subdomain in Vercel DNS.
3. Deploy API after delegation resolves.
4. Deploy worker independently when wanted.
5. Use `--exclusively` only when intentionally skipping foundation deployment.

State clearly that the frontend deploys on Vercel and the backend ALB serves only the API.

- [ ] **Step 3: Run documentation and CI-config checks**

Run: `pnpm exec prettier --check README.md apps/infra/.env.example .github/workflows/ci.yml docs/superpowers/specs/2026-08-23-independent-cdk-service-stacks-design.md`

Expected: all files use repository formatting.

Inspect: `rg -n "certificateArn|hostedZoneId|hostedZoneName|AWS-hosted web|CodePipeline" README.md apps/infra .github/workflows/ci.yml`

Expected: removed CDK inputs appear nowhere in active configuration; CodePipeline appears only in an explicit non-goal/future statement.

- [ ] **Step 4: Commit documentation and CI changes**

```sh
git add README.md apps/infra/.env.example .github/workflows/ci.yml docs/superpowers/specs/2026-08-23-independent-cdk-service-stacks-design.md
git commit -m "docs: explain independent AWS service deployments"
```

### Task 7: Full verification and final audit preparation

**Files:**

- Modify only files required to correct failures found by verification.

**Interfaces:**

- The final diff implements the approved spec without unrelated application changes.
- Verification uses the repository's Node 24.6.0 and pnpm 11.22.0 CI-equivalent toolchain if the host versions differ.

- [ ] **Step 1: Run focused infrastructure verification**

Run:

```sh
pnpm --filter @repo/infra test
pnpm --filter @repo/infra lint
pnpm --filter @repo/infra typecheck
pnpm --filter @repo/infra build
pnpm --filter @repo/infra synth \
  -c domainName=api.fullstack-template.com \
  -c webOrigin=https://app.fullstack-template.com
```

Expected: every command exits zero and synthesis produces exactly three stacks.

- [ ] **Step 2: Run repository-required gates**

Run:

```sh
pnpm format:check
pnpm check
git diff --check
```

Expected: all commands exit zero.

- [ ] **Step 3: Run the faithful uncached CI-equivalent gate**

Run:

```sh
npx --yes --package=node@24.6.0 --package=pnpm@11.22.0 --call \
  'pnpm exec turbo run lint typecheck test build --force'
```

Expected: every Turbo task passes without cache-dependent success.

- [ ] **Step 4: Inspect scope and synthesized ownership**

Run:

```sh
git status --short
git diff --stat HEAD~6..HEAD
git diff --check HEAD~6..HEAD
rg -n "WebService|apps/web/Dockerfile|application-stack|bin/infra" apps/infra .github/workflows/ci.yml README.md
```

Expected: only approved infrastructure, CI, documentation, spec, and plan files changed; legacy AWS web and monolithic-stack references are absent from active code.

- [ ] **Step 5: Prepare the audit evidence**

Record exact command results, the accumulated base/head revisions, changed-file list, three-stack synthesis evidence, and any residual deployment caveats. Do not alter files after capturing evidence unless verification is rerun and the prior audit verdict is discarded.
