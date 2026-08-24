import Link from 'next/link'
import { AuthCard } from '@/components/auth/auth-card'
import { AuthForm } from '@/components/auth/auth-form'
import { AuthField } from '@/components/auth/auth-field'
import { AuthSubmit } from '@/components/auth/auth-submit'
import { signInAction } from '@/auth/actions/password'
export default function SignInPage() {
  return (
    <AuthCard title="Sign in">
      <AuthForm action={signInAction}>
        <AuthField
          autoComplete="email"
          label="Email"
          name="email"
          type="email"
          required
        />
        <AuthField
          autoComplete="current-password"
          label="Password"
          name="password"
          type="password"
          required
        />
        <AuthSubmit>Sign in</AuthSubmit>
      </AuthForm>
      <p className="mt-4 text-sm">
        <Link href="/magic-auth">Use an email code</Link> ·{' '}
        <Link href="/forgot-password">Forgot password?</Link> ·{' '}
        <Link href="/sign-up">Create an account</Link>
      </p>
    </AuthCard>
  )
}
