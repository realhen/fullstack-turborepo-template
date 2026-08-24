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
      cookiePassword: z.string().min(32),
      redirectUri: z.string().url(),
      sessionCookieName: z.string().min(1).default('saas_session'),
      flowCookieName: z.string().min(1).default('saas_auth_flow'),
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
  const socialProviders = (env.WORKOS_SOCIAL_PROVIDERS ?? '')
    .split(',')
    .filter(Boolean)
    .map((value) => providers.parse(value.trim()))
  return { mode: 'workos', ...parsed, socialProviders }
}
