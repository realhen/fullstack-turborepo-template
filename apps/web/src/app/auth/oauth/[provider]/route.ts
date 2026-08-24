import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { authCookieOptions, flowCookieName } from '@/auth/cookies'
import { getWebAuthConfig } from '@/auth/config'
import { createFlowStateCodec } from '@/auth/flow-state'
import { createOAuthFlow, socialProvider } from '@/auth/oauth-service'
import { currentAuthRequestContext } from '@/auth/request-context'
import { safeReturnPath } from '@/auth/return-path'
import { getAuthenticationProvider } from '@/auth/session'

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const config = getWebAuthConfig()
  const returnTo = safeReturnPath(
    new URL(request.url).searchParams.get('returnTo'),
  )
  if (config.mode !== 'workos')
    return NextResponse.redirect(new URL(returnTo, request.url))
  try {
    const provider = socialProvider(
      (await context.params).provider,
      config.socialProviders,
    )
    const flow = createFlowStateCodec(config.cookiePassword)
    const created = await createOAuthFlow({ flow, returnTo })
    const url = await getAuthenticationProvider(config)!.authorizationUrl({
      ...(await currentAuthRequestContext()),
      provider,
      codeVerifier: created.codeVerifier,
      state: created.state,
    })
    ;(await cookies()).set(
      flowCookieName(config),
      created.value,
      authCookieOptions('flow', process.env.NODE_ENV === 'production'),
    )
    return NextResponse.redirect(url)
  } catch {
    return NextResponse.redirect(
      new URL('/sign-in?error=oauth_failed', request.url),
    )
  }
}
