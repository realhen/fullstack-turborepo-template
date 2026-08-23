import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'

const PROJECT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function assertProjectId(value: string): string {
  if (!PROJECT_ID.test(value)) {
    throw new BadRequestException(
      'projectId must be a version 4 UUID',
    )
  }
  return value
}

@Injectable()
export class ProjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    return assertProjectId(value)
  }
}
