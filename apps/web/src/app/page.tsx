import { Button } from '@repo/ui'
import { getApiHealth } from '@/lib/api'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const apiHealth = await getApiHealth()

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-20">
      <div className="max-w-3xl">
        <p className="mb-4 font-mono text-sm uppercase tracking-[0.24em] text-zinc-500">
          Next.js + NestJS + Turborepo
        </p>
        <h1 className="text-balance text-5xl font-semibold tracking-tight sm:text-7xl">
          Start with the architecture already handled.
        </h1>
        <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-zinc-400">
          Separate frontend, API, and infrastructure apps with shared tooling,
          container builds, and CI from the first commit.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <a href="/sign-up">
            <Button>Get started</Button>
          </a>
          <a
            className="rounded-lg border border-zinc-800 px-4 py-2 font-mono text-sm text-zinc-300"
            href="/sign-in"
          >
            Sign in
          </a>
          <a
            className="rounded-lg border border-zinc-800 px-4 py-2 font-mono text-sm text-zinc-300"
            href="/health"
          >
            Web health
          </a>
          <span
            className={`rounded-full px-3 py-1 font-mono text-xs ${
              apiHealth
                ? 'bg-emerald-950 text-emerald-300'
                : 'bg-amber-950 text-amber-300'
            }`}
          >
            API {apiHealth ? 'connected' : 'offline'}
          </span>
        </div>
      </div>
    </main>
  )
}
