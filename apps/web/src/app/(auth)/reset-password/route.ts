import { captureResetToken } from '@/auth/actions/recovery'
export async function GET(request: Request) {
  return captureResetToken(new URL(request.url).searchParams.get('token'))
}
