export const MAX_PROJECT_NAME_LENGTH = 63

export interface AuthConfiguration {
  authAudience?: string
  authClientId?: string
  authIssuer?: string
  authJwksUri?: string
}

/**
 * Project names become Cloud Map DNS labels and prefixes for AWS resources.
 */
export function validateProjectName(projectName: string): void {
  if (
    !new RegExp(
      `^[a-z](?:[a-z0-9-]{0,${MAX_PROJECT_NAME_LENGTH - 2}}[a-z0-9])?$`,
    ).test(projectName)
  ) {
    throw new Error(
      `projectName must be ${MAX_PROJECT_NAME_LENGTH} characters or fewer, start with a lowercase letter, end with a lowercase letter or digit, and contain only lowercase letters, digits, and hyphens.`,
    )
  }
}

export function requireValue(name: string, value: string): string {
  const normalized = value.trim()

  if (!normalized) throw new Error(`${name} is required.`)

  return normalized
}

export function isAuthConfigured(config: AuthConfiguration): boolean {
  const configured = Boolean(
    config.authIssuer &&
    config.authJwksUri &&
    (config.authAudience || config.authClientId),
  )
  const partial = Boolean(
    config.authIssuer ||
    config.authJwksUri ||
    config.authAudience ||
    config.authClientId,
  )

  if (partial && !configured) {
    throw new Error(
      'OIDC authentication requires authIssuer, authJwksUri, and either authAudience or authClientId.',
    )
  }

  return configured
}
