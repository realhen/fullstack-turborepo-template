import Link from 'next/link'
import { AuthCard } from '@/components/auth/auth-card'
import { AuthField } from '@/components/auth/auth-field'
import { AuthSubmit } from '@/components/auth/auth-submit'
import { signUpAction } from '@/auth/actions/password'
export default function SignUpPage() {
  return (
    <AuthCard title="Create your account">
      <form action={signUpAction}>
        <AuthField
          autoComplete="email"
          label="Email"
          name="email"
          type="email"
          required
        />
        <AuthField
          autoComplete="new-password"
          label="Password"
          name="password"
          type="password"
          required
        />
        <AuthSubmit>Create account</AuthSubmit>
      </form>
      <p className="mt-4 text-sm">
        <Link href="/sign-in">Already have an account? Sign in</Link>
      </p>
    </AuthCard>
  )
}
