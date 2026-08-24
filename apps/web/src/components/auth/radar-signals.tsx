'use client'
import { RadarSignalsProvider } from '@workos/radar-signals/react'
import type { ReactNode } from 'react'
export function RadarSignals({ children }: Readonly<{ children: ReactNode }>) { const clientId = process.env.NEXT_PUBLIC_WORKOS_CLIENT_ID; return clientId ? <RadarSignalsProvider clientId={clientId}>{children}</RadarSignalsProvider> : children }
