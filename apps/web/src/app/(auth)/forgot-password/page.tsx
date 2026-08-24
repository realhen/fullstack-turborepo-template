import { AuthCard } from '@/components/auth/auth-card'
import { AuthForm } from '@/components/auth/auth-form'
import { AuthField } from '@/components/auth/auth-field'
import { AuthSubmit } from '@/components/auth/auth-submit'
import { forgotPasswordAction } from '@/auth/actions/recovery'
export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Reset your password">
      <AuthForm action={forgotPasswordAction}>
        <AuthField label="Email" name="email" type="email" required />
        <AuthSubmit>Send recovery email</AuthSubmit>
      </AuthForm>
    </AuthCard>
  )
}
