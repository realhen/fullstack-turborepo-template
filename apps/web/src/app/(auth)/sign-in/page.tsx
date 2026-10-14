import Link from 'next/link'
import {
  beginEnterpriseSsoAction,
  beginSocialOAuthAction,
} from '@/auth/actions/oauth'
import { AuthCard } from '@/components/auth/auth-card'
import { AuthForm } from '@/components/auth/auth-form'
import { AuthField } from '@/components/auth/auth-field'
import { AuthSubmit } from '@/components/auth/auth-submit'
import { signInAction } from '@/auth/actions/password'
import { getWebAuthConfig } from '@/auth/config'
import { safeReturnPath } from '@/auth/return-path'

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; error?: string }>
}) {
  const query = await searchParams
  const returnTo = safeReturnPath(query.returnTo)
  const config = getWebAuthConfig()
  const queryError =
    query.error === 'flow_expired' || query.error === 'oauth_failed'
      ? 'This sign-in attempt expired or could not be completed. Please try again.'
      : undefined
  return (
    <AuthCard title="Sign in">
      {queryError ? (
        <p
          aria-live="polite"
          className="mt-4 text-sm text-red-400"
          role="alert"
        >
          {queryError}
        </p>
      ) : null}
      <AuthForm action={signInAction}>
        <input name="returnTo" type="hidden" value={returnTo} />
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
      {config.mode === 'workos' && config.socialProviders.length ? (
        <div className="mt-6 space-y-2" aria-label="Social sign-in options">
          {config.socialProviders.map((provider) => (
            <AuthForm action={beginSocialOAuthAction} key={provider}>
              <input name="provider" type="hidden" value={provider} />
              <input name="returnTo" type="hidden" value={returnTo} />
              <AuthSubmit>
                {`Continue with ${provider.replace('OAuth', '')}`}
              </AuthSubmit>
            </AuthForm>
          ))}
        </div>
      ) : null}
      <AuthForm action={beginEnterpriseSsoAction}>
        <input name="returnTo" type="hidden" value={returnTo} />
        <AuthField label="Work email for SSO" name="email" type="email" />
        <AuthSubmit>Continue with SSO</AuthSubmit>
      </AuthForm>
      <p className="mt-4 text-sm">
        <Link href={`/magic-auth?returnTo=${encodeURIComponent(returnTo)}`}>
          Use an email code
        </Link>{' '}
        · <Link href="/forgot-password">Forgot password?</Link> ·{' '}
        <Link href={`/sign-up?returnTo=${encodeURIComponent(returnTo)}`}>
          Create an account
        </Link>
      </p>
    </AuthCard>
  )
}
