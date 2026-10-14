import { Suspense, type ReactNode } from 'react'
import { getCurrentUser } from '@/auth/current-user'
import { SaasShell } from '@/components/saas-shell'
import { getWorkspace } from '@/lib/saas-api'

export const dynamic = 'force-dynamic'

export default async function WorkspaceLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [workspace, user] = await Promise.all([
    getWorkspace(),
    getCurrentUser(),
  ])
  return (
    <Suspense fallback={<main className="min-h-screen bg-zinc-950" />}>
      <SaasShell user={user} workspace={workspace}>
        {children}
      </SaasShell>
    </Suspense>
  )
}
