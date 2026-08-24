'use client'

import { useActionState, type ReactNode } from 'react'
import type { AuthActionState } from '@/auth/action-state'

export function ActionStateForm({
  action,
  children,
}: Readonly<{
  action: (formData: FormData) => Promise<AuthActionState | void>
  children: ReactNode
}>) {
  const [state, formAction] = useActionState<AuthActionState, FormData>(
    async (_previous, formData) => (await action(formData)) ?? {},
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
