import type { ProjectMembership } from '../projects/project.types'

/** A provider-neutral identity that application authorization consumes. */
export type Principal = {
  id: string
  email?: string
  provider: string
  scopes: readonly string[]
}

export type RequestWithPrincipal = {
  headers: { authorization?: string }
  params: Record<string, string | undefined>
  principal?: Principal
  project?: ProjectMembership
}
