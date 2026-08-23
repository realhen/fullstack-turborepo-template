import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'

const ORGANIZATION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

@Injectable()
export class OrganizationIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    return assertOrganizationId(value)
  }
}

export function assertOrganizationId(value: string): string {
  if (!ORGANIZATION_ID.test(value)) {
    throw new BadRequestException('organizationId must be a version 4 UUID')
  }
  return value
}
