import { AuthCard } from '@/components/auth/auth-card'
import { AuthForm } from '@/components/auth/auth-form'
import { AuthField } from '@/components/auth/auth-field'
import { AuthSubmit } from '@/components/auth/auth-submit'
import {
  completeMagicAuthAction,
  startMagicAuthAction,
} from '@/auth/actions/recovery'
export default async function MagicAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>
}) {
  const code = (await searchParams).code
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
            <AuthField label="Email" name="email" type="email" required />
            <AuthSubmit>Send another code</AuthSubmit>
          </AuthForm>
        </>
      ) : (
        <AuthForm action={startMagicAuthAction}>
          <AuthField label="Email" name="email" type="email" required />
          <AuthSubmit>Send code</AuthSubmit>
        </AuthForm>
      )}
    </AuthCard>
  )
}
