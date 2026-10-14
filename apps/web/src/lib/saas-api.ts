import 'server-only'

import { ApiClientError, unwrap, type ApiGetResponse } from '@repo/api-client'
import { createServerApiClient } from '@repo/api-client/server'
import { currentApiAuthorization } from '@/auth/session'
import type {
  AuditEvent,
  BillingPlan,
  OrganizationOption,
  ProjectMember,
  ProjectOption,
  Workspace,
} from './saas.types'

type ProjectMembersResponse =
  ApiGetResponse<'/api/v1/projects/{projectId}/members'>

const client = createServerApiClient()

async function authorizationHeaders(): Promise<HeadersInit> {
  const authorization = await currentApiAuthorization()
  return authorization ? { authorization } : {}
}

function message(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.status === 401 || error.status === 403
      ? 'Connect an authenticated API session to view this workspace.'
      : 'The workspace service is unavailable. Please try again shortly.'
  }
  return 'The workspace service is unavailable. Please try again shortly.'
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function organizationOptions(response: unknown): OrganizationOption[] {
  if (!Array.isArray(response)) return []
  return response.flatMap((item) => {
    const membership = record(item)
    const organization = record(membership?.organization)
    const id = text(organization?.id)
    const name = text(organization?.name)
    const slug = text(organization?.slug)
    if (!id || !name || !slug) return []
    return [{ id, name, slug, role: text(membership?.role) }]
  })
}

function projectOptions(response: unknown): ProjectOption[] {
  if (!Array.isArray(response)) return []
  return response.flatMap((item) => {
    const project = record(item)
    const id = text(project?.id)
    const name = text(project?.name)
    const slug = text(project?.slug)
    return id && name && slug ? [{ id, name, slug }] : []
  })
}

export async function getWorkspace(): Promise<Workspace> {
  try {
    const headers = await authorizationHeaders()
    const [principalResult, organizationsResult] = await Promise.all([
      client.GET('/api/v1/me', { headers }),
      client.GET('/api/v1/organizations', {
        headers,
      }),
    ])
    const organizations = organizationOptions(unwrap(organizationsResult))
    const projects = await Promise.all(
      organizations.map(async (organization) => {
        const result = await client.GET(
          '/api/v1/organizations/{organizationId}/projects',
          {
            headers,
            params: { path: { organizationId: organization.id } },
          },
        )
        return [organization.id, projectOptions(unwrap(result))] as const
      }),
    )
    const principal = record(unwrap(principalResult))
    const provider = text(principal?.provider)
    return {
      organizations,
      projectsByOrganization: Object.fromEntries(projects),
      ...(provider ? { provider } : {}),
    }
  } catch (error) {
    return {
      error: message(error),
      organizations: [],
      projectsByOrganization: {},
    }
  }
}

export async function getBillingPlans(organizationId: string): Promise<{
  error?: string
  plans: BillingPlan[]
}> {
  try {
    const headers = await authorizationHeaders()
    const result = await client.GET(
      '/api/v1/organizations/{organizationId}/billing/plans',
      {
        headers,
        params: { path: { organizationId } },
      },
    )
    const response = record(unwrap(result))
    const plans = Array.isArray(response?.plans)
      ? response.plans.flatMap((item) => {
          const plan = record(item)
          const code = text(plan?.code)
          const displayName = text(plan?.displayName)
          const interval = plan?.interval
          return code &&
            displayName &&
            (interval === 'month' || interval === 'year')
            ? [{ code, displayName, interval } satisfies BillingPlan]
            : []
        })
      : []
    return { plans }
  } catch (error) {
    return { error: message(error), plans: [] }
  }
}

export async function getAuditEvents(organizationId: string): Promise<{
  error?: string
  events: AuditEvent[]
}> {
  try {
    const headers = await authorizationHeaders()
    const result = await client.GET(
      '/api/v1/organizations/{organizationId}/audit-events',
      {
        headers,
        params: { path: { organizationId } },
      },
    )
    const response = record(unwrap(result))
    const events = Array.isArray(response?.items)
      ? response.items.flatMap((item) => {
          const event = record(item)
          const id = text(event?.id)
          const action = text(event?.action)
          const occurredAt = text(event?.occurredAt)
          const resourceType = text(event?.resourceType)
          return id && action && occurredAt && resourceType
            ? [
                {
                  action,
                  actorId: text(event?.actorId),
                  id,
                  occurredAt,
                  resourceType,
                },
              ]
            : []
        })
      : []
    return { events }
  } catch (error) {
    return { error: message(error), events: [] }
  }
}

export async function getProjectMembers(projectId: string) {
  try {
    const headers = await authorizationHeaders()
    const result = await client.GET('/api/v1/projects/{projectId}/members', {
      headers,
      params: { path: { projectId } },
    })
    const response = unwrap(result) as ProjectMembersResponse
    const members: ProjectMember[] = Array.isArray(response)
      ? response.flatMap((item) => {
          const member = record(item)
          const userId = text(member?.userId)
          const role = text(member?.role)
          return userId && role ? [{ role, userId }] : []
        })
      : []
    return { members }
  } catch (error) {
    return { error: message(error), members: [] }
  }
}

export async function getSelectedWorkspace(input: {
  organizationId?: string
  projectId?: string
}) {
  const workspace = await getWorkspace()
  const organization =
    workspace.organizations.find((item) => item.id === input.organizationId) ??
    workspace.organizations[0]
  const projects = organization
    ? (workspace.projectsByOrganization[organization.id] ?? [])
    : []
  const project =
    projects.find((item) => item.id === input.projectId) ?? projects[0]
  return { organization, project, workspace }
}
