import { AuthCard } from '@/components/auth/auth-card'
import { AuthForm } from '@/components/auth/auth-form'
import { AuthField } from '@/components/auth/auth-field'
import { AuthSubmit } from '@/components/auth/auth-submit'
import { resetPasswordAction } from '@/auth/actions/recovery'
export default function ResetPasswordPage() {
  return (
    <AuthCard title="Choose a new password">
      <AuthForm action={resetPasswordAction}>
        <AuthField
          label="New password"
          name="password"
          type="password"
          required
        />
        <AuthSubmit>Reset password</AuthSubmit>
      </AuthForm>
    </AuthCard>
  )
}
