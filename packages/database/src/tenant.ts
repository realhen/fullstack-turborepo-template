/**
 * Required for every repository operation over tenant-owned data. The API
 * derives this from an authorized membership; callers must never create it
 * directly from a request parameter.
 */
export type TenantContext = {
  organizationId: string
  actorId: string
}

export function assertTenantContext(context: TenantContext): TenantContext {
  if (!context.organizationId || !context.actorId) {
    throw new Error('Tenant context requires an organization and actor')
  }
  return context
}
