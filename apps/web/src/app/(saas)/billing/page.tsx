import { getBillingPlans, getSelectedWorkspace } from '@/lib/saas-api'
import { selectionFromSearchParams, type SearchParams } from '@/lib/page-params'

export default async function BillingPage({
  searchParams,
}: Readonly<{ searchParams: SearchParams }>) {
  const selection = await selectionFromSearchParams(searchParams).then(
    getSelectedWorkspace,
  )
  const billing = selection.organization
    ? await getBillingPlans(selection.organization.id)
    : {
        plans: [],
        error:
          selection.workspace.error ??
          'Choose an organization to view billing plans.',
      }
  return (
    <section>
      <h1 className="text-3xl font-semibold tracking-tight">Billing</h1>
      <p className="mt-2 max-w-2xl text-zinc-400">
        Plans available to{' '}
        {selection.organization?.name ?? 'the selected organization'}.
      </p>
      {billing.error ? (
        <p className="mt-5 text-sm text-amber-300">{billing.error}</p>
      ) : null}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {billing.plans.map((plan) => (
          <article
            className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6"
            key={plan.code}
          >
            <p className="text-xl font-medium">{plan.displayName}</p>
            <p className="mt-2 text-sm text-zinc-400">
              Billed {plan.interval}ly
            </p>
            <p className="mt-4 font-mono text-xs text-zinc-500">
              {plan.code}
            </p>
          </article>
        ))}
      </div>
      {billing.plans.length === 0 && !billing.error ? (
        <p className="mt-8 text-sm text-zinc-400">
          No billing plans are configured.
        </p>
      ) : null}
    </section>
  )
}
