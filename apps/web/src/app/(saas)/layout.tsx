import { Suspense, type ReactNode } from 'react'
import { SaasShell } from '@/components/saas-shell'
import { getWorkspace } from '@/lib/saas-api'

export default async function WorkspaceLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const workspace = await getWorkspace()
  return (
    <Suspense fallback={<main className="min-h-screen bg-zinc-950" />}>
      <SaasShell workspace={workspace}>{children}</SaasShell>
    </Suspense>
  )
}
