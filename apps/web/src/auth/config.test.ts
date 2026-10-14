import { describe, expect, it } from 'vitest'
import { getWebAuthConfig } from './config'

const cookiePassword = 'X5h#q9Lp2!vR7mK4@zT8cN1wB6yD3fG0'

describe('getWebAuthConfig', () => {
  it('allows explicit local mode outside production without WorkOS credentials', () => {
    expect(
      getWebAuthConfig({ NODE_ENV: 'test', WEB_AUTH_MODE: 'local' }),
    ).toMatchObject({ mode: 'local' })
  })

  it('accepts a complete WorkOS configuration', () => {
    expect(
      getWebAuthConfig({
        NODE_ENV: 'production',
        WEB_AUTH_MODE: 'workos',
        WORKOS_API_KEY: 'sk_test',
        WORKOS_CLIENT_ID: 'client_01',
        WORKOS_COOKIE_PASSWORD: cookiePassword,
        WORKOS_REDIRECT_URI: 'https://app.example.com/auth/callback',
        WORKOS_SOCIAL_PROVIDERS: 'GoogleOAuth,GitHubOAuth',
        WORKOS_RADAR_MODE: 'log',
        NEXT_PUBLIC_WORKOS_CLIENT_ID: 'client_01',
      }),
    ).toMatchObject({
      mode: 'workos',
      socialProviders: ['GoogleOAuth', 'GitHubOAuth'],
      radarMode: 'log',
    })
  })

  it('does not require the public client ID while Radar is off', () => {
    expect(
      getWebAuthConfig({
        NODE_ENV: 'production',
        WEB_AUTH_MODE: 'workos',
        WORKOS_API_KEY: 'sk_test',
        WORKOS_CLIENT_ID: 'client_01',
        WORKOS_COOKIE_PASSWORD: cookiePassword,
        WORKOS_REDIRECT_URI: 'https://app.example.com/auth/callback',
        WORKOS_RADAR_MODE: 'off',
      }),
    ).toMatchObject({ mode: 'workos', radarMode: 'off' })
  })

  it('does not silently ignore partial WorkOS configuration when mode is unset', () => {
    expect(() =>
      getWebAuthConfig({ NODE_ENV: 'test', WORKOS_API_KEY: 'sk_test' }),
    ).toThrow()
  })

  it.each([
    { NODE_ENV: 'production', WEB_AUTH_MODE: 'local' },
    { NODE_ENV: 'production', WEB_AUTH_MODE: 'workos', WORKOS_API_KEY: 'sk' },
    {
      NODE_ENV: 'production',
      WEB_AUTH_MODE: 'workos',
      WORKOS_API_KEY: 'sk',
      WORKOS_CLIENT_ID: 'client',
      WORKOS_COOKIE_PASSWORD: 'short',
      WORKOS_REDIRECT_URI: 'https://app.example.com/auth/callback',
    },
    {
      NODE_ENV: 'production',
      WEB_AUTH_MODE: 'workos',
      WORKOS_API_KEY: 'sk',
      WORKOS_CLIENT_ID: 'client',
      WORKOS_COOKIE_PASSWORD: cookiePassword,
      WORKOS_REDIRECT_URI: 'http://app.example.com/auth/callback',
    },
    {
      NODE_ENV: 'production',
      WEB_AUTH_MODE: 'workos',
      WORKOS_API_KEY: 'sk',
      WORKOS_CLIENT_ID: 'client',
      WORKOS_COOKIE_PASSWORD: cookiePassword,
      WORKOS_REDIRECT_URI: 'https://app.example.com/auth/callback',
      WORKOS_SOCIAL_PROVIDERS: 'DiscordOAuth',
    },
    {
      NODE_ENV: 'production',
      WEB_AUTH_MODE: 'workos',
      WORKOS_API_KEY: 'sk',
      WORKOS_CLIENT_ID: 'client',
      WORKOS_COOKIE_PASSWORD: cookiePassword,
      WORKOS_REDIRECT_URI: 'https://app.example.com/auth/callback',
      WORKOS_RADAR_MODE: 'unsafe',
    },
    {
      NODE_ENV: 'production',
      WEB_AUTH_MODE: 'workos',
      WORKOS_API_KEY: 'sk',
      WORKOS_CLIENT_ID: 'client',
      WORKOS_COOKIE_PASSWORD: 'x'.repeat(32),
      WORKOS_REDIRECT_URI: 'https://app.example.com/auth/callback',
    },
    {
      NODE_ENV: 'production',
      WEB_AUTH_MODE: 'workos',
      WORKOS_API_KEY: 'sk',
      WORKOS_CLIENT_ID: 'client',
      WORKOS_COOKIE_PASSWORD: 'change-me-to-a-real-secret-value'.repeat(2),
      WORKOS_REDIRECT_URI: 'https://app.example.com/auth/callback',
    },
    {
      NODE_ENV: 'production',
      WEB_AUTH_MODE: 'workos',
      WORKOS_API_KEY: 'sk',
      WORKOS_CLIENT_ID: 'client',
      WORKOS_COOKIE_PASSWORD: cookiePassword,
      WORKOS_REDIRECT_URI: 'https://app.example.com/auth/callback',
      WORKOS_RADAR_MODE: 'enforce',
      NEXT_PUBLIC_WORKOS_CLIENT_ID: 'other-client',
    },
    {
      NODE_ENV: 'production',
      WEB_AUTH_MODE: 'workos',
      WORKOS_API_KEY: 'sk',
      WORKOS_CLIENT_ID: 'client',
      WORKOS_COOKIE_PASSWORD: cookiePassword,
      WORKOS_REDIRECT_URI: 'https://app.example.com/auth/callback',
      WORKOS_SESSION_COOKIE_NAME: 'same',
      WORKOS_FLOW_COOKIE_NAME: 'same',
    },
    {
      NODE_ENV: 'production',
      WEB_AUTH_MODE: 'workos',
      WORKOS_API_KEY: 'sk',
      WORKOS_CLIENT_ID: 'client',
      WORKOS_COOKIE_PASSWORD: cookiePassword,
      WORKOS_REDIRECT_URI: 'https://app.example.com/auth/callback',
      WORKOS_SESSION_COOKIE_NAME: 'invalid;name',
    },
    {
      NODE_ENV: 'production',
      WEB_AUTH_MODE: 'workos',
      WORKOS_API_KEY: 'sk',
      WORKOS_CLIENT_ID: 'client',
      WORKOS_COOKIE_PASSWORD: cookiePassword,
      WORKOS_REDIRECT_URI: 'https://app.example.com/auth/callback',
      WORKOS_FLOW_COOKIE_NAME: 'invalid name',
    },
  ])('fails closed for unsafe configuration', (env) => {
    expect(() => getWebAuthConfig(env as NodeJS.ProcessEnv)).toThrow()
  })
})
