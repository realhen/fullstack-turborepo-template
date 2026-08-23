# Repository guide

- Keep deployable services in `apps/` and reusable, domain-agnostic code in `packages/`.
- Do not import application code across app boundaries. Communicate between `web` and `api` over HTTP.
- Prefer Server Components in Next.js; add `use client` only for browser APIs, state, or event handlers.
- Validate all NestJS inputs at the boundary and keep controllers thin.
- Never commit secrets. Update the relevant `.env.example` whenever a new environment variable is introduced.
- Before handing off changes, run `pnpm check` and `pnpm format:check`.

