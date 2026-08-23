import { timingSafeEqual, createHmac } from 'node:crypto'
import { BadRequestException } from '@nestjs/common'

export function verifyStripeWebhookSignature(input: {
  rawBody: Buffer
  signature?: string
  secret: string
  toleranceSeconds?: number
  now?: Date
}): void {
  const parts = input.signature
    ?.split(',')
    .map((part) => part.split('='))
    .filter((part): part is [string, string] => part.length === 2)
  const timestamp = parts?.find(([key]) => key === 't')?.[1]
  const expectedSignatures = parts
    ?.filter(([key]) => key === 'v1')
    .map(([, value]) => value)

  if (!timestamp || !expectedSignatures?.length) {
    throw new BadRequestException('Stripe webhook signature is missing')
  }

  const parsedTimestamp = Number(timestamp)
  if (!Number.isSafeInteger(parsedTimestamp)) {
    throw new BadRequestException('Stripe webhook timestamp is invalid')
  }
  const tolerance = input.toleranceSeconds ?? 300
  const nowSeconds = Math.floor((input.now?.getTime() ?? Date.now()) / 1000)
  if (Math.abs(nowSeconds - parsedTimestamp) > tolerance) {
    throw new BadRequestException(
      'Stripe webhook timestamp is outside tolerance',
    )
  }

  const expected = createHmac('sha256', input.secret)
    .update(`${timestamp}.${input.rawBody.toString('utf8')}`, 'utf8')
    .digest('hex')
  const expectedBuffer = Buffer.from(expected, 'hex')
  const matches = expectedSignatures.some((signature) => {
    const received = Buffer.from(signature, 'hex')
    return (
      received.length === expectedBuffer.length &&
      timingSafeEqual(received, expectedBuffer)
    )
  })
  if (!matches) {
    throw new BadRequestException('Stripe webhook signature is invalid')
  }
}
