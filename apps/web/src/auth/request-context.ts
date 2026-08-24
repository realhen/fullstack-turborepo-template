import { isIP } from 'node:net'
import { headers } from 'next/headers'
export interface AuthRequestContext { ipAddress?: string; userAgent?: string }
function firstIp(value: string | null): string | undefined { return value?.split(',').map((part) => part.trim()).find((part) => isIP(part) !== 0) }
export function requestContextFromHeaders(value: Headers): AuthRequestContext {
  const ipAddress = firstIp(value.get('x-vercel-forwarded-for')) ?? firstIp(value.get('x-forwarded-for'))
  const userAgent = value.get('user-agent')?.trim() || undefined
  return { ...(ipAddress ? { ipAddress } : {}), ...(userAgent ? { userAgent } : {}) }
}
export async function currentAuthRequestContext(): Promise<AuthRequestContext> { return requestContextFromHeaders(await headers()) }
