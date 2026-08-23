import { getAuditEvents, getSelectedWorkspace } from '@/lib/saas-api'
import { selectionFromSearchParams, type SearchParams } from '@/lib/page-params'

export default async function AuditPage({
  searchParams,
}: Readonly<{ searchParams: SearchParams }>) {
  const selection = await selectionFromSearchParams(searchParams).then(
    getSelectedWorkspace,
  )
  const audit = selection.organization
    ? await getAuditEvents(selection.organization.id)
    : {
        events: [],
        error:
          selection.workspace.error ??
          'Choose an organization to view its audit log.',
      }
  return (
    <section>
      <h1 className="text-3xl font-semibold tracking-tight">Audit log</h1>
      <p className="mt-2 text-zinc-400">
        Security-relevant events for{' '}
        {selection.organization?.name ?? 'the selected organization'}.
      </p>
      {audit.error ? (
        <p className="mt-4 text-sm text-amber-300">{audit.error}</p>
      ) : null}
      <ol className="mt-8 divide-y divide-zinc-800 rounded-xl border border-zinc-800">
        {audit.events.map((event) => (
          <li
            className="flex items-center justify-between gap-4 p-4"
            key={event.id}
          >
            <span>{event.action}</span>
            <time className="text-sm text-zinc-500">{event.occurredAt}</time>
          </li>
        ))}
      </ol>
      {audit.events.length === 0 && !audit.error ? (
        <p className="mt-4 text-sm text-zinc-400">
          No audit events are available.
        </p>
      ) : null}
    </section>
  )
}
