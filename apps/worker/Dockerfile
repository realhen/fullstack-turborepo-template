FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/billing/package.json packages/billing/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
RUN pnpm install --frozen-lockfile
COPY apps/worker apps/worker
COPY packages/billing packages/billing
COPY packages/database packages/database
COPY packages/eslint-config packages/eslint-config
COPY packages/typescript-config packages/typescript-config
RUN pnpm --filter @repo/worker... build
RUN pnpm deploy --filter @repo/worker --prod /prod/worker

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN wget -qO /etc/ssl/certs/rds-global-bundle.pem \
      https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
    && test -s /etc/ssl/certs/rds-global-bundle.pem \
    && addgroup --system --gid 1001 app \
    && adduser --system --uid 1001 --ingroup app app
COPY --from=build --chown=app:app /prod/worker ./
USER app
CMD ["node", "dist/main.js"]
