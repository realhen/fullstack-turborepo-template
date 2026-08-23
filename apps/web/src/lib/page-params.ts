export type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>

export async function selectionFromSearchParams(searchParams: SearchParams) {
  const params = await searchParams
  const organizationId =
    typeof params.organization === 'string' ? params.organization : undefined
  const projectId =
    typeof params.project === 'string' ? params.project : undefined
  return {
    ...(organizationId ? { organizationId } : {}),
    ...(projectId ? { projectId } : {}),
  }
}
