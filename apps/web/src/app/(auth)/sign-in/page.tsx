import Link from 'next/link'
import { AuthCard } from '@/components/auth/auth-card'
import { AuthField } from '@/components/auth/auth-field'
import { AuthSubmit } from '@/components/auth/auth-submit'
import { signInAction } from '@/auth/actions/password'
export default function SignInPage() { return <AuthCard title="Sign in"><form action={async (data) => { await signInAction(data) }}><AuthField autoComplete="email" label="Email" name="email" type="email" required /><AuthField autoComplete="current-password" label="Password" name="password" type="password" required /><AuthSubmit>Sign in</AuthSubmit></form><p className="mt-4 text-sm"><Link href="/magic-auth">Use an email code</Link> · <Link href="/forgot-password">Forgot password?</Link> · <Link href="/sign-up">Create an account</Link></p></AuthCard> }
