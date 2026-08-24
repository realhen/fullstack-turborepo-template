import { z } from 'zod'

export type SocialProvider =
  'GoogleOAuth' | 'MicrosoftOAuth' | 'GitHubOAuth' | 'AppleOAuth'

export type WebAuthConfig =
  | { mode: 'local'; sessionCookieName: string }
  | {
      mode: 'workos'
      apiKey: string
      clientId: string
      cookiePassword: string
      redirectUri: string
      sessionCookieName: string
      flowCookieName: string
      socialProviders: readonly SocialProvider[]
      radarMode: 'off' | 'log' | 'enforce'
    }

const providers = z.enum([
  'GoogleOAuth',
  'MicrosoftOAuth',
  'GitHubOAuth',
  'AppleOAuth',
])
const mode = z.enum(['local', 'workos'])
const radar = z.enum(['off', 'log', 'enforce'])
const cookieName = z
  .string()
  .regex(/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/, 'Invalid HTTP cookie name')
const cookiePassword = z
  .string()
  .min(32)
  .refine((value) => !/^(.)(\1)*$/.test(value), {
    message: 'WORKOS_COOKIE_PASSWORD must not repeat one character',
  })
  .refine(
    (value) =>
      !/^(?:change|example|password|secret|replace|your|test|todo)/i.test(
        value,
      ),
    { message: 'WORKOS_COOKIE_PASSWORD must not use placeholder material' },
  )
  .refine(
    (value) =>
      [/[a-z]/, /[A-Z]/, /\d/, /[^\w\s]/].filter((pattern) =>
        pattern.test(value),
      ).length >= 3,
    {
      message:
        'WORKOS_COOKIE_PASSWORD must contain at least three character classes',
    },
  )

export function getWebAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
): WebAuthConfig {
  const production = env.NODE_ENV === 'production'
  const configuredMode = env.WEB_AUTH_MODE
  if (
    !configuredMode &&
    Object.keys(env).some((key) => key.startsWith('WORKOS_') && env[key])
  ) {
    throw new Error(
      'WEB_AUTH_MODE must be set when WorkOS configuration is present',
    )
  }
  const selectedMode = configuredMode
    ? mode.parse(configuredMode)
    : production
      ? 'workos'
      : 'local'
  if (selectedMode === 'local') {
    if (production)
      throw new Error('WEB_AUTH_MODE=local is forbidden in production')
    return {
      mode: 'local',
      sessionCookieName: env.WORKOS_SESSION_COOKIE_NAME ?? 'saas_session',
    }
  }
  const parsed = z
    .object({
      apiKey: z.string().min(1),
      clientId: z.string().min(1),
      cookiePassword,
      redirectUri: z.string().url(),
      sessionCookieName: cookieName.default('saas_session'),
      flowCookieName: cookieName.default('saas_auth_flow'),
      radarMode: radar.default('off'),
    })
    .parse({
      apiKey: env.WORKOS_API_KEY,
      clientId: env.WORKOS_CLIENT_ID,
      cookiePassword: env.WORKOS_COOKIE_PASSWORD,
      redirectUri: env.WORKOS_REDIRECT_URI,
      sessionCookieName: env.WORKOS_SESSION_COOKIE_NAME,
      flowCookieName: env.WORKOS_FLOW_COOKIE_NAME,
      radarMode: env.WORKOS_RADAR_MODE,
    })
  if (production && new URL(parsed.redirectUri).protocol !== 'https:')
    throw new Error('WORKOS_REDIRECT_URI must use HTTPS in production')
  if (parsed.sessionCookieName === parsed.flowCookieName)
    throw new Error('WorkOS session and flow cookie names must be distinct')
  if (
    parsed.radarMode !== 'off' &&
    env.NEXT_PUBLIC_WORKOS_CLIENT_ID !== parsed.clientId
  )
    throw new Error(
      'NEXT_PUBLIC_WORKOS_CLIENT_ID must match WORKOS_CLIENT_ID when Radar is enabled',
    )
  const socialProviders = (env.WORKOS_SOCIAL_PROVIDERS ?? '')
    .split(',')
    .filter(Boolean)
    .map((value) => providers.parse(value.trim()))
  return { mode: 'workos', ...parsed, socialProviders }
}
