'use client'

import { useRadarToken } from '@workos/radar-signals/react'
import { useActionState, type ReactNode } from 'react'
import type { AuthActionState } from '@/auth/action-state'

export function RadarAuthForm({
  action,
  children,
}: Readonly<{
  action: (formData: FormData) => Promise<AuthActionState | void>
  children: ReactNode
}>) {
  const { getToken } = useRadarToken()

  const [state, formAction] = useActionState<AuthActionState, FormData>(
    async (_previous, formData) => {
      const signalsId = await getToken()
      if (signalsId) formData.set('signalsId', signalsId)
      return (await action(formData)) ?? {}
    },
    {},
  )

  return (
    <form action={formAction}>
      {children}
      {state.message ? (
        <p
          aria-live="polite"
          className="mt-3 text-sm text-red-400"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
