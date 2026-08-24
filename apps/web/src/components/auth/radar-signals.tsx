'use client'
import { RadarSignalsProvider } from '@workos/radar-signals/react'
import type { ReactNode } from 'react'
export function RadarSignals({
  children,
  enabled,
}: Readonly<{ children: ReactNode; enabled: boolean }>) {
  const clientId = process.env.NEXT_PUBLIC_WORKOS_CLIENT_ID
  return enabled && clientId ? (
    <RadarSignalsProvider clientId={clientId}>{children}</RadarSignalsProvider>
  ) : (
    children
  )
}
