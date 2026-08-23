'use client'

import { useEffect, type ReactNode } from 'react'

/** Analytics is inert unless a public PostHog key is configured. */
export function PostHogProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST
    if (!key) return

    void import('posthog-js').then(({ default: posthog }) => {
      posthog.init(key, {
        autocapture: false,
        capture_pageleave: true,
        capture_pageview: true,
        persistence: 'memory',
        ...(host ? { api_host: host } : {}),
      })
      // Anonymous, ephemeral analytics only: never identify with account PII.
      posthog.capture('saas_shell_loaded', { surface: 'workspace' })
    })
  }, [])

  return children
}
