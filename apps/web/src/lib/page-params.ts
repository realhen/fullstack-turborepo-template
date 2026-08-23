export type SearchParams = Promise<Record<string, string | string[] | undefined>>

export async function selectionFromSearchParams(searchParams: SearchParams) {
  const params = await searchParams
  return {
    organizationId:
      typeof params.organization === 'string' ? params.organization : undefined,
    projectId: typeof params.project === 'string' ? params.project : undefined,
  }
}
