import { AuthCard } from '@/components/auth/auth-card'
import { AuthForm } from '@/components/auth/auth-form'
import { AuthField } from '@/components/auth/auth-field'
import { AuthSubmit } from '@/components/auth/auth-submit'
import { verifyEmailAction } from '@/auth/actions/password'
export default function VerifyEmailPage() {
  return (
    <AuthCard title="Verify your email">
      <AuthForm action={verifyEmailAction}>
        <AuthField
          autoComplete="one-time-code"
          label="Verification code"
          name="code"
          required
        />
        <AuthSubmit>Verify email</AuthSubmit>
      </AuthForm>
    </AuthCard>
  )
}
