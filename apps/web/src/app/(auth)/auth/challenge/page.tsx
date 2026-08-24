import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AuthCard } from '@/components/auth/auth-card'
import { AuthField } from '@/components/auth/auth-field'
import { AuthSubmit } from '@/components/auth/auth-submit'
import {
  completeRadarChallengeAction,
  completeTotpChallengeAction,
  selectOrganizationAction,
  startRadarSmsChallengeAction,
  startTotpChallengeAction,
  startTotpEnrollmentAction,
} from '@/auth/actions/challenge'
import { getWebAuthConfig } from '@/auth/config'
import { flowCookieName } from '@/auth/cookies'
import { createFlowStateCodec } from '@/auth/flow-state'

export default async function ChallengePage() {
  const config = getWebAuthConfig()
  if (config.mode !== 'workos') redirect('/sign-in')
  const value = (await cookies()).get(flowCookieName(config))?.value
  if (!value) redirect('/sign-in?error=flow_expired')
  const flow = await createFlowStateCodec(config.cookiePassword).unseal(value)

  if (flow.kind === 'mfa-enrollment')
    return (
      <AuthCard title="Set up authenticator verification">
        {flow.secret && flow.uri && flow.challengeId ? (
          <>
            <p className="mt-4 text-sm">
              Add this secret to your authenticator app.
            </p>
            <code className="mt-2 block break-all text-sm">{flow.secret}</code>
            <code className="mt-2 block break-all text-sm">{flow.uri}</code>
            <form action={completeTotpChallengeAction}>
              <AuthField label="Authenticator code" name="code" required />
              <AuthSubmit>Verify code</AuthSubmit>
            </form>
          </>
        ) : (
          <form action={startTotpEnrollmentAction}>
            <p className="mt-4 text-sm">
              Set up an authenticator app to continue.
            </p>
            <AuthSubmit>Set up authenticator</AuthSubmit>
          </form>
        )}
      </AuthCard>
    )

  if (flow.kind === 'mfa')
    return (
      <AuthCard title="Authenticator verification">
        {flow.challengeId ? (
          <form action={completeTotpChallengeAction}>
            <AuthField label="Authenticator code" name="code" required />
            <AuthSubmit>Verify code</AuthSubmit>
          </form>
        ) : (
          <form action={startTotpChallengeAction}>
            <label className="mt-4 block text-sm" htmlFor="factorId">
              Authenticator
            </label>
            <select
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 p-2"
              id="factorId"
              name="factorId"
            >
              {flow.factors.map((factor) => (
                <option key={factor.id} value={factor.id}>
                  Authenticator app
                </option>
              ))}
            </select>
            <AuthSubmit>Continue</AuthSubmit>
          </form>
        )}
      </AuthCard>
    )

  if (flow.kind === 'organization-selection')
    return (
      <AuthCard title="Choose your organization">
        <form action={selectOrganizationAction}>
          <label className="mt-4 block text-sm" htmlFor="organizationId">
            Organization
          </label>
          <select
            className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 p-2"
            id="organizationId"
            name="organizationId"
          >
            {flow.organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
          <AuthSubmit>Continue</AuthSubmit>
        </form>
      </AuthCard>
    )

  if (flow.kind === 'radar-sms')
    return (
      <AuthCard title="Confirm your phone number">
        {flow.verificationId ? (
          <form action={completeRadarChallengeAction}>
            <AuthField
              autoComplete="one-time-code"
              label="SMS code"
              name="code"
              required
            />
            <AuthSubmit>Verify code</AuthSubmit>
          </form>
        ) : (
          <form action={startRadarSmsChallengeAction}>
            <AuthField
              autoComplete="tel"
              label="Mobile number"
              name="phoneNumber"
              placeholder="+14165551234"
              required
              type="tel"
            />
            <AuthSubmit>Send code</AuthSubmit>
          </form>
        )}
      </AuthCard>
    )

  if (flow.kind === 'radar-email')
    return (
      <AuthCard title="Confirm your email">
        <form action={completeRadarChallengeAction}>
          <AuthField
            autoComplete="one-time-code"
            label="Email code"
            name="code"
            required
          />
          <AuthSubmit>Verify code</AuthSubmit>
        </form>
      </AuthCard>
    )

  redirect('/sign-in?error=flow_expired')
}
