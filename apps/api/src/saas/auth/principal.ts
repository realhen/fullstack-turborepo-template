import type { ProjectMembership } from '../projects/project.types'

/** A provider-neutral identity that application authorization consumes. */
export type Principal = {
  id: string
  /** Durable application user resolved from issuer + subject, when configured. */
  userId?: string
  email?: string
  emailVerified?: boolean
  organizationId?: string
  projectId?: string
  provider: string
  scopes: readonly string[]
}

export type RequestWithPrincipal = {
  headers: { authorization?: string }
  params: Record<string, string | undefined>
  principal?: Principal
  project?: ProjectMembership
}
