export type OrganizationOption = {
  id: string
  name: string
  role: string | null
  slug: string
}

export type ProjectOption = {
  id: string
  name: string
  slug: string
}

export type ProjectMember = {
  role: string
  userId: string
}

export type Workspace = {
  error?: string
  organizations: OrganizationOption[]
  projectsByOrganization: Record<string, ProjectOption[]>
  provider?: string
}

export type AuditEvent = {
  action: string
  actorId: string | null
  id: string
  occurredAt: string
  resourceType: string
}

export type BillingPlan = {
  code: string
  displayName: string
  interval: 'month' | 'year'
}
