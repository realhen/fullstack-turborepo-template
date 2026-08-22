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
4. Install and start everything.

```bash
corepack enable
pnpm bootstrap --name my-app
pnpm install
pnpm dev
```

Open:

- Web: [http://localhost:3000](http://localhost:3000)
- API: [http://localhost:3001/api/v1](http://localhost:3001/api/v1)
- Swagger: [http://localhost:3001/api/docs](http://localhost:3001/api/docs)
- API health: [http://localhost:3001/api/v1/health](http://localhost:3001/api/v1/health)

`pnpm bootstrap` changes the root project name, updates the CDK context, and creates app `.env` files without overwriting existing ones. Workspace package names stay under the neutral `@repo/*` namespace, so a new project does not require a broad rename.

## Everyday commands

```bash
pnpm dev              # Run web and API development servers
pnpm dev:web          # Run only Next.js
pnpm dev:api          # Run only NestJS
pnpm check            # Lint, typecheck, test, and build everything
pnpm check:affected   # Run checks only for changed packages and dependents
pnpm format           # Format the repository
docker compose up --build
```

Turbo caches deterministic tasks and runs the workspace graph in parallel. CI runs the complete quality gate on pushes to `main` and pull requests. Dependabot keeps npm and GitHub Actions dependencies current.

## Configuration

Never commit `.env` files. Document each new variable in the nearest `.env.example`.

The web app uses `API_URL` only on the server. Use `NEXT_PUBLIC_API_URL` only when browser code truly needs a public API address; values with the `NEXT_PUBLIC_` prefix are embedded into the client bundle.

The API validates configuration at startup. Add application-specific fields to `apps/api/src/env.ts` so an invalid deployment fails immediately instead of failing on its first request.

## Deployment

The included AWS CDK stack builds both Dockerfiles, deploys them to private ECS Fargate tasks, exposes the web app through a public application load balancer, and routes `/api/*` to NestJS. Internal web-to-API traffic uses Cloud Map service discovery.

```bash
aws configure sso
pnpm --filter @repo/infra exec cdk bootstrap
pnpm --filter @repo/infra diff
pnpm --filter @repo/infra deploy
```

The stack creates billable AWS resources, including a NAT gateway, load balancer, and two Fargate services. Review `cdk diff` and AWS pricing before deployment. The starter serves HTTP from the generated load-balancer hostname; add Route 53 and an ACM certificate before exposing a production domain.

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
