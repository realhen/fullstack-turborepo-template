import { getProjectMembers, getSelectedWorkspace } from '@/lib/saas-api'
import { selectionFromSearchParams, type SearchParams } from '@/lib/page-params'

export default async function MembersPage({
  searchParams,
}: Readonly<{ searchParams: SearchParams }>) {
  const selection =
    await selectionFromSearchParams(searchParams).then(getSelectedWorkspace)
  const members = selection.project
    ? await getProjectMembers(selection.project.id)
    : {
        members: [],
        error:
          selection.workspace.error ?? 'Choose a project to view its members.',
      }
  return (
    <section>
      <h1 className="text-3xl font-semibold tracking-tight">Members</h1>
      <p className="mt-2 text-zinc-400">
        People with access to{' '}
        {selection.project?.name ?? 'the selected project'}.
      </p>
      {members.error ? (
        <p className="mt-4 text-sm text-amber-300">{members.error}</p>
      ) : null}
      <div className="mt-8 overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-900 text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Member</th>
              <th className="px-4 py-3 font-medium">Role</th>
            </tr>
          </thead>
          <tbody>
            {members.members.map((member) => (
              <tr className="border-t border-zinc-800" key={member.userId}>
                <td className="px-4 py-3">{member.userId}</td>
                <td className="px-4 py-3 capitalize text-zinc-300">
                  {member.role}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {members.members.length === 0 ? (
          <p className="p-4 text-sm text-zinc-400">
            No members are available for this project.
          </p>
        ) : null}
      </div>
    </section>
  )
}
