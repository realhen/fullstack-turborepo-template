import type { ReactNode } from 'react'
import type { AuthActionState } from '@/auth/action-state'
import { getWebAuthConfig } from '@/auth/config'
import { ActionStateForm } from './action-state-form'
import { RadarAuthForm } from './radar-auth-form'

export function AuthForm({
  action,
  children,
}: Readonly<{
  action: (formData: FormData) => Promise<AuthActionState | void>
  children: ReactNode
}>) {
  const config = getWebAuthConfig()
  const radarEnabled =
    config.mode === 'workos' &&
    config.radarMode !== 'off' &&
    Boolean(process.env.NEXT_PUBLIC_WORKOS_CLIENT_ID)
  return radarEnabled ? (
    <RadarAuthForm action={action}>{children}</RadarAuthForm>
  ) : (
    <ActionStateForm action={action}>{children}</ActionStateForm>
  )
}
