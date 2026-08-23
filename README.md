# Full-stack Turborepo Template

A general-purpose TypeScript monorepo for shipping a separate Next.js frontend, NestJS API, and AWS CDK deployment stack without carrying product-specific architecture into every new app.

## What is included

| Path                         | Purpose                                                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`                   | Next.js App Router frontend, Tailwind CSS, standalone container output                                                           |
| `apps/api`                   | NestJS API with validated configuration, request validation, rate limiting, security headers, Swagger, health checks, and Vitest |
| `apps/infra`                 | AWS CDK stack for a VPC, ECS Fargate services, service discovery, autoscaling, and an application load balancer                  |
| `packages/ui`                | Small source-first React component package; replace or extend it with your design system                                         |
| `packages/eslint-config`     | Shared flat ESLint configuration for TypeScript, Next.js, and NestJS                                                             |
| `packages/typescript-config` | Strict shared TypeScript configurations                                                                                          |

The frontend and backend remain independent applications. There is intentionally no shared contracts package: API boundaries can evolve through OpenAPI, generated clients, or whichever integration style fits the new product.

## Start a new app

1. Click **Use this template** on GitHub and clone the generated repository.
2. Install Node.js 24 and enable Corepack.
3. Bootstrap the project name and local environment files.
4. Install dependencies.

```bash
corepack enable
pnpm bootstrap --name my-app
pnpm install
```

`pnpm bootstrap` changes the root project name, updates the CDK context, and creates app `.env` files without overwriting existing ones. Workspace package names stay under the neutral `@repo/*` namespace, so a new project does not require a broad rename.

## Local development

No AWS account, CDK bootstrap, or cloud deployment is required to develop or test this template.

### Native development with hot reload

```bash
pnpm dev
```

This starts Next.js and NestJS concurrently. Changes in either application reload locally.

### Containerized, production-like development

```bash
pnpm dev:containers
# equivalent: docker compose up --build
```

Docker Compose builds the same Dockerfiles used by CDK, starts both services, and wires the web container to the API container. CI builds and starts this stack, then checks its health endpoints and web-to-API connection. This is useful in cloud development environments and for testing the production container layout without deploying AWS infrastructure.

Open either local workflow at:

- Web: [http://localhost:3000](http://localhost:3000)
- API: [http://localhost:3001/api/v1](http://localhost:3001/api/v1)
- Swagger (local only): [http://localhost:3001/api/docs](http://localhost:3001/api/docs)
- API health: [http://localhost:3001/api/v1/health](http://localhost:3001/api/v1/health)

## Everyday commands

```bash
pnpm dev              # Run web and API development servers
pnpm dev:web          # Run only Next.js
pnpm dev:api          # Run only NestJS
pnpm check            # Lint, typecheck, test, and build everything
pnpm check:affected   # Run checks only for changed packages and dependents
pnpm format           # Format the repository
pnpm dev:containers   # Run the full stack with Docker Compose
```

Turbo caches deterministic tasks and runs the workspace graph in parallel. CI runs the complete quality gate on pushes to `main` and pull requests. Dependabot keeps npm and GitHub Actions dependencies current.

## Configuration

Never commit `.env` files. Document each new variable in the nearest `.env.example`.

The web app uses `API_URL` only on the server. Use `NEXT_PUBLIC_API_URL` only when browser code truly needs a public API address; values with the `NEXT_PUBLIC_` prefix are embedded into the client bundle.

The API validates configuration at startup. Add application-specific fields to `apps/api/src/env.ts` so an invalid deployment fails immediately instead of failing on its first request. Swagger is enabled by `ENABLE_SWAGGER=true`; the local environment files and Docker Compose set it, while CDK production deployments leave it disabled.

## Deployment

The included AWS CDK stack builds both Dockerfiles, deploys them to private ECS Fargate tasks, exposes the web app through a public HTTPS application load balancer, and routes `/api/*` to NestJS. Internal web-to-API traffic uses Cloud Map service discovery.

CDK deployment requires an existing regional ACM certificate. This prevents an accidental HTTP-only deployment. Create or validate the certificate in the same AWS Region as the stack, then point your domain record to the load balancer.

```bash
aws configure sso
export CERTIFICATE_ARN=arn:aws:acm:us-east-1:123456789012:certificate/your-certificate-id
pnpm --filter @repo/infra exec cdk bootstrap
pnpm --filter @repo/infra exec cdk diff -c certificateArn="$CERTIFICATE_ARN"
pnpm --filter @repo/infra exec cdk deploy -c certificateArn="$CERTIFICATE_ARN"
```

The stack creates billable AWS resources, including a NAT gateway, load balancer, WAF web ACL, and two Fargate services. Review `cdk diff` and AWS pricing before deployment. A regional WAF rule limits a source IP to 500 requests per five-minute evaluation window, so the basic abuse limit stays effective even when the API service scales out. Add product-specific quotas or a shared rate-limit store when you need identity- or endpoint-aware limits.

Destroy a test stack when it is no longer needed:

```bash
pnpm --filter @repo/infra destroy
```

## Adding product capabilities

- Database: add a dedicated data package only after choosing the datastore and migration tool.
- Authentication: keep authorization enforcement in the API and pass only safe session state to the frontend.
- API clients: generate from Swagger/OpenAPI when the interface becomes large enough to justify it.
- Shared code: add a package only when two consumers genuinely share stable, domain-agnostic behavior.
- Production operations: add HTTPS, domain records, secrets, persistence, alarms, and deployment workflows for the target environment.

## Dependency policy

Versions are pinned through `pnpm-lock.yaml` and declared with compatible ranges in the workspace catalog. The template intentionally uses TypeScript 6 and ESLint 9 because the current TypeScript-ESLint and React lint ecosystems do not yet fully support TypeScript 7 and ESLint 10. Upgrade those majors when their peer dependency ranges catch up.
