'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { ChangeEvent, ReactNode } from 'react'
import type { Workspace } from '@/lib/saas.types'

const navigation = [
  { href: '/', label: 'Overview' },
  { href: '/members', label: 'Members' },
  { href: '/billing', label: 'Billing' },
  { href: '/api-keys', label: 'API keys' },
  { href: '/audit', label: 'Audit log' },
]

export function SaasShell({
  children,
  workspace,
}: Readonly<{ children: ReactNode; workspace: Workspace }>) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const organization =
    workspace.organizations.find(
      (item) => item.id === searchParams.get('organization'),
    ) ?? workspace.organizations[0]
  const projects = organization
    ? (workspace.projectsByOrganization[organization.id] ?? [])
    : []
  const project =
    projects.find((item) => item.id === searchParams.get('project')) ??
    projects[0]

  function navigate(next: { organizationId?: string; projectId?: string }) {
    const query = new URLSearchParams(searchParams.toString())
    if (next.organizationId) query.set('organization', next.organizationId)
    if (next.projectId) query.set('project', next.projectId)
    else query.delete('project')
    router.replace(`${pathname}?${query.toString()}`)
  }

  function selectOrganization(event: ChangeEvent<HTMLSelectElement>) {
    navigate({ organizationId: event.target.value })
  }

  function selectProject(event: ChangeEvent<HTMLSelectElement>) {
    navigate({
      organizationId: organization?.id,
      projectId: event.target.value,
    })
  }

  const navigationQuery = searchParams.toString()

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-950/90 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Link className="font-semibold tracking-tight" href="/">
            Acme
          </Link>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="organization-switcher">
              Organization
            </label>
            <select
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
              disabled={workspace.organizations.length === 0}
              id="organization-switcher"
              onChange={selectOrganization}
              value={organization?.id ?? ''}
            >
              {workspace.organizations.length === 0 ? (
                <option>No organizations</option>
              ) : (
                workspace.organizations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))
              )}
            </select>
            <label className="sr-only" htmlFor="project-switcher">
              Project
            </label>
            <select
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
              disabled={projects.length === 0}
              id="project-switcher"
              onChange={selectProject}
              value={project?.id ?? ''}
            >
              {projects.length === 0 ? (
                <option>No projects</option>
              ) : (
                projects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))
              )}
            </select>
            <span className="hidden rounded-full bg-zinc-800 px-2 py-1 text-xs text-zinc-300 sm:inline">
              {organization?.role ?? 'member'}
            </span>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[13rem_1fr]">
        <aside>
          <nav
            aria-label="Workspace"
            className="flex gap-1 overflow-x-auto lg:flex-col"
          >
            {navigation.map((item) => {
              const active = pathname === item.href
              return (
                <Link
                  aria-current={active ? 'page' : undefined}
                  className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors ${active ? 'bg-zinc-800 font-medium text-white' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'}`}
                  href={
                    navigationQuery
                      ? `${item.href}?${navigationQuery}`
                      : item.href
                  }
                  key={item.href}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  )
}
