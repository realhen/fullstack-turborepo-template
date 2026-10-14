import type { ReactNode } from 'react'
import { getWebAuthConfig } from '@/auth/config'
import { RadarSignals } from '@/components/auth/radar-signals'

export const dynamic = 'force-dynamic'

export default function AuthLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const config = getWebAuthConfig()
  return (
    <RadarSignals
      enabled={config.mode === 'workos' && config.radarMode !== 'off'}
    >
      {children}
    </RadarSignals>
  )
}
