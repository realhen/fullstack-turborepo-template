import type { ReactNode } from 'react'
import { RadarSignals } from '@/components/auth/radar-signals'
export default function AuthLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <RadarSignals>{children}</RadarSignals>
}
