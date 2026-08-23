import { getApiHealth } from '@/lib/api'
import { getSelectedWorkspace } from '@/lib/saas-api'
import { selectionFromSearchParams, type SearchParams } from '@/lib/page-params'

export const dynamic = 'force-dynamic'

export default async function OverviewPage({
  searchParams,
}: Readonly<{ searchParams: SearchParams }>) {
  const [apiHealth, selection] = await Promise.all([
    getApiHealth(),
    selectionFromSearchParams(searchParams).then(getSelectedWorkspace),
  ])
  const { organization, project, workspace } = selection

  return (
    <section>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">
        {organization?.name ?? 'Workspace'}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Overview</h1>
      <p className="mt-2 max-w-2xl text-zinc-400">
        A focused view of your organization’s access, billing, and operational
        activity.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Metric label="Project" value={project?.name ?? 'No project'} />
        <Metric label="Authentication" value={workspace.provider ?? 'Unavailable'} />
        <Metric
          label="API status"
          tone={apiHealth ? 'good' : 'warn'}
          value={apiHealth ? 'Connected' : 'Offline'}
        />
      </div>
      {workspace.error ? (
        <p className="mt-5 text-sm text-amber-300">{workspace.error}</p>
      ) : null}
    </section>
  )
}

function Metric({
  label,
  tone,
  value,
}: Readonly<{ label: string; tone?: 'good' | 'warn'; value: string }>) {
  const color =
    tone === 'good'
      ? 'text-emerald-300'
      : tone === 'warn'
        ? 'text-amber-300'
        : ''
  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <p className="text-sm text-zinc-400">{label}</p>
      <p className={`mt-3 text-xl font-medium ${color}`}>{value}</p>
    </article>
  )
}
