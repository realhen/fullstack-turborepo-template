import { AuthCard } from '@/components/auth/auth-card'
import { AuthForm } from '@/components/auth/auth-form'
import { AuthField } from '@/components/auth/auth-field'
import { AuthSubmit } from '@/components/auth/auth-submit'
import {
  completeMagicAuthAction,
  startMagicAuthAction,
} from '@/auth/actions/recovery'
import { safeReturnPath } from '@/auth/return-path'
export default async function MagicAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; returnTo?: string }>
}) {
  const query = await searchParams
  const code = query.code
  const returnTo = safeReturnPath(query.returnTo)
  return (
    <AuthCard title="Sign in with an email code">
      {code ? (
        <>
          <AuthForm action={completeMagicAuthAction}>
            <AuthField
              autoComplete="one-time-code"
              label="Email code"
              name="code"
              required
            />
            <AuthSubmit>Sign in</AuthSubmit>
          </AuthForm>
          <AuthForm action={startMagicAuthAction}>
            <input name="returnTo" type="hidden" value={returnTo} />
            <AuthField label="Email" name="email" type="email" required />
            <AuthSubmit>Send another code</AuthSubmit>
          </AuthForm>
        </>
      ) : (
        <AuthForm action={startMagicAuthAction}>
          <input name="returnTo" type="hidden" value={returnTo} />
          <AuthField label="Email" name="email" type="email" required />
          <AuthSubmit>Send code</AuthSubmit>
        </AuthForm>
      )}
    </AuthCard>
  )
}
