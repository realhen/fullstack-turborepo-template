import { getSelectedWorkspace } from '@/lib/saas-api'
import { selectionFromSearchParams, type SearchParams } from '@/lib/page-params'

export default async function ApiKeysPage({
  searchParams,
}: Readonly<{ searchParams: SearchParams }>) {
  const selection =
    await selectionFromSearchParams(searchParams).then(getSelectedWorkspace)
  return (
    <section>
      <h1 className="text-3xl font-semibold tracking-tight">API keys</h1>
      <p className="mt-2 text-zinc-400">
        Create scoped credentials for server-to-server integrations in{' '}
        {selection.organization?.name ?? 'your organization'}.
      </p>
      {selection.workspace.error ? (
        <p className="mt-4 text-sm text-amber-300">
          {selection.workspace.error}
        </p>
      ) : null}
      <article className="mt-8 rounded-xl border border-dashed border-zinc-700 p-6">
        <h2 className="font-medium">
          API key management is ready for an action flow
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          The API currently exposes create and revoke operations only. It
          intentionally does not expose a read endpoint, so this page never
          fabricates key data or secrets.
        </p>
      </article>
    </section>
  )
}
