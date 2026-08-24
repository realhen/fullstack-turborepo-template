import { AuthCard } from '@/components/auth/auth-card'
import { AuthSubmit } from '@/components/auth/auth-submit'
import { beginSsoAction } from '@/auth/actions/challenge'

export default function SsoPage() {
  return (
    <AuthCard title="Continue with your organization">
      <p className="mt-4 text-sm">
        Your organization requires single sign-on to continue.
      </p>
      <form action={beginSsoAction}>
        <AuthSubmit>Continue with single sign-on</AuthSubmit>
      </form>
    </AuthCard>
  )
}
