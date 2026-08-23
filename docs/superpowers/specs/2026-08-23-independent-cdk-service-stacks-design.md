# Independent CDK Service Stacks Design

**Status:** Approved for implementation

**Date:** 2026-08-23

## Purpose

Refactor `apps/infra` so infrastructure ownership is easy to review, backend
services are independently deployable, and repeated ECS infrastructure is
encapsulated in an opinionated reusable construct. Remove the Next.js web
service from AWS because the frontend will deploy on Vercel.

The template will provide a production-shaped AWS backend without adding a
GitHub connection, CodePipeline, or any other real continuous-deployment
integration. A future pipeline must be able to supply an ECR-backed container
image to the same reusable service construct without redesigning the stacks.

## Goals

- Replace `bin/infra.ts` with `apps/infra/app.ts` as the CDK entrypoint.
- Replace the monolithic `ApplicationStack` with three CloudFormation stacks:
  `foundation-stack`, `api-stack`, and `worker-stack`.
- Make API and worker deployments independently selectable with the CDK CLI.
- Keep API and worker stacks independent of one another; both may depend on
  the shared foundation.
- Group each service's CDK code by ownership: access control, database
  integration, Fargate service, monitoring, and domain concerns.
- Encapsulate common ECS production defaults in a reusable Fargate construct.
- Remove all AWS-hosted Next.js resources and the web Docker image asset.
- Give the API its own public HTTPS Application Load Balancer and WAF.
- Support a Vercel-owned parent domain with an API subdomain delegated to a
  Route 53 hosted zone.
- Preserve the current API migration gate, standalone migration task, worker
  behavior, database durability settings, and production scaling defaults.

## Non-goals

- Adding CodePipeline, CodeBuild, a GitHub connection, or automatic production
  deployment.
- Changing application behavior, HTTP routes, billing jobs, authentication,
  database schema, or Docker images.
- Deploying the Next.js application on AWS.
- Making the worker runtime-independent of the API or PostgreSQL.
- Creating a general-purpose infrastructure framework that exposes every ECS
  or ALB option.
- Supporting an arbitrary number of AWS regions or accounts in one deployment.

## Stack architecture

`app.ts` is the only CDK application entrypoint. It reads deployment context,
creates the shared environment, instantiates the three stacks, and synthesizes
the app. It contains no service resources.

```text
CDK App
├── foundation-stack
│   ├── VPC and private subnets
│   ├── ECS cluster and Cloud Map namespace
│   ├── PostgreSQL instance and credential rotation
│   ├── shared worker-to-API secret
│   ├── service security groups and shared network rules
│   ├── shared alarm topic
│   └── delegated Route 53 API hosted zone
├── api-stack
│   ├── API and migration task definitions
│   ├── API Fargate service
│   ├── public HTTPS ALB
│   ├── WAF
│   ├── ACM certificate and Route 53 alias
│   └── API and database monitoring
└── worker-stack
    ├── worker task definition
    ├── worker Fargate service
    ├── worker autoscaling
    └── worker monitoring
```

The API and worker stacks receive only foundation resources. Neither stack
receives the other stack or any resource created by the other stack. The
worker uses the deterministic Cloud Map address
`http://api.<projectName>.local:3001` at runtime. It may be deployed before the
API, although it cannot process work successfully until the API is available.

The construct IDs are stable and intentionally CLI-friendly:

```sh
pnpm --filter @repo/infra exec cdk deploy foundation-stack
pnpm --filter @repo/infra exec cdk deploy api-stack
pnpm --filter @repo/infra exec cdk deploy worker-stack
```

Deploying `api-stack` may also evaluate or update `foundation-stack`, but it
must never select `worker-stack`. Deploying `worker-stack` may also evaluate or
update `foundation-stack`, but it must never select `api-stack`. Operators can
use `--exclusively` when they deliberately want to skip dependency deployment.

## Source layout

```text
apps/infra/
├── app.ts
├── lib/
│   ├── constructs/
│   │   ├── container-image.ts
│   │   ├── database-bindings.ts
│   │   └── fargate-service.ts
│   ├── foundation/
│   │   ├── access-control.ts
│   │   ├── database.ts
│   │   ├── domain.ts
│   │   ├── network.ts
│   │   ├── shared-resources.ts
│   │   └── stack.ts
│   ├── api/
│   │   ├── access-control.ts
│   │   ├── database.ts
│   │   ├── domain.ts
│   │   ├── fargate-service.ts
│   │   ├── monitoring.ts
│   │   └── stack.ts
│   └── worker/
│       ├── access-control.ts
│       ├── database.ts
│       ├── fargate-service.ts
│       ├── monitoring.ts
│       └── stack.ts
└── test/
    ├── api-stack.test.ts
    ├── foundation-stack.test.ts
    ├── fargate-service.test.ts
    └── worker-stack.test.ts
```

Only files that carry a real responsibility will be created. If a proposed
module would merely re-export one symbol or contain no meaningful logic, it
will be folded into the nearest ownership file rather than committed as an
empty abstraction.

## Reusable Fargate construct

The shared construct is an opinionated repository-internal CDK construct, not
a separately published package. It standardizes:

- Linux x86_64 Fargate task definitions.
- CPU and memory configuration.
- Docker image integration through `ecs.ContainerImage`.
- CloudWatch log drivers and one-month retention.
- Environment variables, Secrets Manager values, commands, health checks,
  port mappings, and optional init containers.
- ECS deployment circuit breakers and rollback.
- ECS Exec.
- Desired count, rolling deployment limits, and CPU target tracking.
- Optional Cloud Map registration.
- Optional public HTTPS ALB wiring, including HTTP-to-HTTPS redirection and
  target-group health checks.

The construct exposes the task definition, primary container, ECS service,
connections, and optional load balancer and target group. Service modules use
those explicit outputs for access rules and monitoring.

The API supplies its migration init container and public-load-balancer
configuration. The worker omits both. The abstraction must not contain API,
worker, billing, PostgreSQL, Stripe, OIDC, WAF, DNS, or alarm policy. Those
remain service or foundation concerns.

`container-image.ts` centralizes the repository root, ignore patterns,
`linux/amd64` platform, and optional Docker target. The construct accepts any
`ecs.ContainerImage`, preserving a future migration from CDK Docker assets to
pipeline-built ECR images.

## Foundation ownership

The foundation stack owns resources genuinely shared across backend services:

- A two-AZ VPC with private application subnets and one NAT gateway.
- The ECS cluster with Container Insights and the project Cloud Map namespace.
- The encrypted, private, Multi-AZ PostgreSQL 16.3 instance, generated
  credentials, deletion protection, snapshot removal policy, backups,
  storage autoscaling, enhanced monitoring, and 30-day secret rotation.
- The secret used for worker-to-API authentication.
- API, worker, and database security groups plus the worker-to-API and
  service-to-database rules that can be expressed without a service-stack
  cycle.
- The SNS topic and optional email subscription shared by alarms.
- A public Route 53 hosted zone for the delegated API subdomain.

Foundation outputs include the API hosted-zone name servers, database secret
ARN, cluster name, private subnet IDs, and security group IDs needed for
operations and manual migration recovery.

The first deployment is intentionally two-phase:

1. Deploy `foundation-stack`.
2. Add its API-zone NS records to the parent domain's Vercel DNS.
3. Deploy `api-stack`, allowing ACM DNS validation to complete.
4. Deploy `worker-stack` when background processing is wanted.

This avoids waiting for an ACM certificate before the delegated hosted zone is
publicly reachable.

## API ownership

`ApiStack` composes focused modules and owns only API deployment resources.

### Database integration

`api/database.ts` creates the common PostgreSQL environment and ECS secret
maps used by API and migration containers. It creates the standalone migration
task and supplies the same-image migration init-container definition to the
API service. Pool limits remain API `4` and migration `1`. TLS continues to use
the RDS global bundle with `verify-full`.

### Fargate service

`api/fargate-service.ts` builds the API Docker asset with the `aws-runner`
target, configures OIDC and optional Stripe settings, creates the migration
startup gate, and invokes the reusable construct with two desired tasks and
CPU autoscaling from two to four tasks.

The public ALB sends its default HTTPS traffic to the API service. Its health
check uses `/api/v1/health`; the API container continues listening on port 3001. There is no web target group or `/api/*` listener rule because the ALB is
now API-only.

### Domain and access control

`api/domain.ts` creates a DNS-validated regional ACM certificate for the API
domain and an alias record in the delegated hosted zone. It exports the HTTPS
API URL.

`api/access-control.ts` creates and associates the existing regional WAF rules
with the API ALB. Security-group rules expose only HTTPS publicly and permit
the ALB and worker paths defined by the foundation policy.

### Monitoring

`api/monitoring.ts` preserves the elevated target-5xx alarm and PostgreSQL CPU
alarm, sends both to the shared SNS topic, and creates an API operations
dashboard for ALB, API CPU, and PostgreSQL metrics.

## Worker ownership

`WorkerStack` owns the worker Docker asset, task definition, Fargate service,
logs, access bindings, and scaling policy. It uses one desired task and scales
between one and four tasks at 70 percent CPU.

It receives standard PostgreSQL variables and secrets from its own focused
module, uses pool maximum `2`, and receives the shared worker secret. The
existing polling, batch, lease, retry, and internal API URL values remain
unchanged.

The worker has no load balancer, public DNS, certificate, WAF, or public
ingress. Its monitoring module creates a worker operations dashboard without
inventing new alert thresholds in this refactor.

## Frontend and CORS

No `apps/web` application code or local Docker Compose behavior is removed.
Only AWS web infrastructure is deleted.

The intended production topology is:

- `fullstack-template.com`: Vercel marketing site.
- `app.fullstack-template.com`: Vercel Next.js application.
- `api.fullstack-template.com`: AWS API.

The API stack receives a required `webOrigin` context value and sets
`CORS_ORIGIN` to that exact origin. `domainName` identifies the API hostname;
the two values are no longer conflated. CORS is a browser interoperability
policy, not an authentication boundary. Existing OIDC authentication,
authorization, WAF, and rate limiting remain the security controls.

## Configuration and outputs

Required CDK context:

- `projectName`
- `domainName`, such as `api.fullstack-template.com`
- `webOrigin`, such as `https://app.fullstack-template.com`

Optional context remains:

- `alarmEmail`
- `applicationSecretsArn`
- `authAudience`
- `authClientId`
- `authIssuer`
- `authJwksUri`

The previous `certificateArn`, `hostedZoneId`, and `hostedZoneName` inputs are
removed because the new foundation and API stacks own the delegated hosted
zone, certificate, and alias. OIDC configuration retains its all-or-nothing
validation. Project-name validation remains shared and is applied before any
named resources are created.

Outputs are placed on the stack that owns the resource. Operational migration
outputs remain available from the API/foundation pair, including the migration
task definition ARN, cluster name, security group, private subnet IDs, and
database secret ARN.

## Failure behavior and lifecycle

- Missing required context fails during synthesis with an actionable message.
- Partial OIDC configuration fails during synthesis.
- Deploying API before delegating the hosted zone causes certificate
  validation to wait or fail; documentation makes the two-phase bootstrap
  explicit.
- Deploying a service without a successfully deployed foundation fails before
  service creation.
- Migration failure prevents a new API task from starting.
- ECS circuit breakers roll back failed API or worker deployments.
- Removing `api-stack` does not delete the database or worker stack.
- Removing `worker-stack` does not modify API resources.
- Removing `foundation-stack` remains intentionally protected by the database
  deletion and snapshot policies and by CloudFormation dependencies.

## Documentation changes

The infrastructure section of `README.md` will describe:

- Vercel frontend deployment and the absence of an AWS web service.
- Parent-domain ownership in Vercel and API subdomain delegation to Route 53.
- The two-phase first deployment.
- Individual foundation, API, and worker deployment commands.
- The meaning of `domainName` and `webOrigin`.
- The optional nature of the worker deployment.
- The future pipeline integration point without claiming that CI/CD exists.

`apps/infra/.env.example`, `cdk.json`, package scripts, lint inputs, and
TypeScript includes will be updated for the new entrypoint and configuration.

## Verification

Focused infrastructure tests will prove:

- Foundation contains the VPC, cluster, database, shared secrets, hosted zone,
  and no ECS services or load balancers.
- API contains only API task definitions and one API ECS service.
- API uses one Docker image asset, including its migration containers.
- API has an HTTPS listener, HTTP redirect, WAF association, DNS record,
  certificate, expected scaling, migration dependency, alarms, and dashboard.
- Worker contains one task definition and one ECS service, with no ALB, WAF,
  DNS, certificate, or database instance.
- Worker preserves its environment, secrets, and scaling bounds.
- No synthesized stack contains an AWS-hosted web service or web Docker asset.
- Invalid project names, incomplete OIDC settings, and missing required origins
  fail clearly.
- API and worker stack dependency graphs include foundation but exclude one
  another.
- The reusable construct applies the production defaults and supports both
  load-balanced and internal services.

Before handoff, run:

```sh
pnpm --filter @repo/infra test
pnpm --filter @repo/infra typecheck
pnpm --filter @repo/infra lint
pnpm --filter @repo/infra build
pnpm --filter @repo/infra synth \
  -c domainName=api.fullstack-template.com \
  -c webOrigin=https://app.fullstack-template.com
pnpm format:check
pnpm check
git diff --check
```

The final synthesis must include all three stacks and must not require live AWS
credentials for repository CI.
