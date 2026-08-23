import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'

const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

export function assertProjectId(value: string): string {
  if (!PROJECT_ID.test(value)) {
    throw new BadRequestException(
      'projectId must be 1-64 characters using letters, numbers, hyphens, or underscores',
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
