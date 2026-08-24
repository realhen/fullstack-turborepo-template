import { AuthCard } from '@/components/auth/auth-card'
import { AuthField } from '@/components/auth/auth-field'
import { AuthSubmit } from '@/components/auth/auth-submit'
import { verifyEmailAction } from '@/auth/actions/password'
export default function VerifyEmailPage() { return <AuthCard title="Verify your email"><form action={async (data) => { await verifyEmailAction(data) }}><AuthField autoComplete="one-time-code" label="Verification code" name="code" required /><AuthSubmit>Verify email</AuthSubmit></form></AuthCard> }
