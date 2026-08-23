# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

FROM base AS pruner
WORKDIR /repo
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/infra/package.json apps/infra/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm exec turbo prune @repo/api --docker

FROM base AS builder
WORKDIR /repo
COPY --from=pruner /repo/out/json/ .
COPY --from=pruner /repo/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
RUN pnpm turbo run build --filter=@repo/api
RUN pnpm deploy --filter=@repo/api --prod /prod/api

FROM node:24-alpine AS runner-base
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app
RUN addgroup --system --gid 1001 app \
    && adduser --system --uid 1001 --ingroup app app
COPY --from=builder --chown=app:app /prod/api ./
USER app
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3001/api/v1/health || exit 1
CMD ["node", "dist/main.js"]

FROM runner-base AS aws-runner
USER root
RUN wget -qO /etc/ssl/certs/rds-global-bundle.pem \
      https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
    && test -s /etc/ssl/certs/rds-global-bundle.pem
USER app

FROM runner-base AS runner
