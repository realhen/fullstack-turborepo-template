import { describe, expect, it } from 'vitest'
import { getWebAuthConfig } from './config'

describe('getWebAuthConfig', () => {
  it('allows explicit local mode outside production without WorkOS credentials', () => {
    expect(getWebAuthConfig({ NODE_ENV: 'test', WEB_AUTH_MODE: 'local' })).toMatchObject({ mode: 'local' })
  })

  it('accepts a complete WorkOS configuration', () => {
    expect(getWebAuthConfig({ NODE_ENV: 'production', WEB_AUTH_MODE: 'workos', WORKOS_API_KEY: 'sk_test', WORKOS_CLIENT_ID: 'client_01', WORKOS_COOKIE_PASSWORD: 'x'.repeat(32), WORKOS_REDIRECT_URI: 'https://app.example.com/auth/callback', WORKOS_SOCIAL_PROVIDERS: 'GoogleOAuth,GitHubOAuth', WORKOS_RADAR_MODE: 'log' })).toMatchObject({ mode: 'workos', socialProviders: ['GoogleOAuth', 'GitHubOAuth'], radarMode: 'log' })
  })

  it.each([
    { NODE_ENV: 'production', WEB_AUTH_MODE: 'local' },
    { NODE_ENV: 'production', WEB_AUTH_MODE: 'workos', WORKOS_API_KEY: 'sk' },
    { NODE_ENV: 'production', WEB_AUTH_MODE: 'workos', WORKOS_API_KEY: 'sk', WORKOS_CLIENT_ID: 'client', WORKOS_COOKIE_PASSWORD: 'short', WORKOS_REDIRECT_URI: 'https://app.example.com/auth/callback' },
    { NODE_ENV: 'production', WEB_AUTH_MODE: 'workos', WORKOS_API_KEY: 'sk', WORKOS_CLIENT_ID: 'client', WORKOS_COOKIE_PASSWORD: 'x'.repeat(32), WORKOS_REDIRECT_URI: 'http://app.example.com/auth/callback' },
    { NODE_ENV: 'production', WEB_AUTH_MODE: 'workos', WORKOS_API_KEY: 'sk', WORKOS_CLIENT_ID: 'client', WORKOS_COOKIE_PASSWORD: 'x'.repeat(32), WORKOS_REDIRECT_URI: 'https://app.example.com/auth/callback', WORKOS_SOCIAL_PROVIDERS: 'DiscordOAuth' },
    { NODE_ENV: 'production', WEB_AUTH_MODE: 'workos', WORKOS_API_KEY: 'sk', WORKOS_CLIENT_ID: 'client', WORKOS_COOKIE_PASSWORD: 'x'.repeat(32), WORKOS_REDIRECT_URI: 'https://app.example.com/auth/callback', WORKOS_RADAR_MODE: 'unsafe' },
  ])('fails closed for unsafe configuration', (env) => {
    expect(() => getWebAuthConfig(env as NodeJS.ProcessEnv)).toThrow()
  })
})
