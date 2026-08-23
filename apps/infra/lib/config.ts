export const MAX_PROJECT_NAME_LENGTH = 63

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
