import { IsIn, IsString, MaxLength, MinLength } from 'class-validator'
import { PROJECT_ROLES, type ProjectRole } from './project.types'

export class AddProjectMemberDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  userId!: string

  @IsIn(PROJECT_ROLES)
  role!: ProjectRole
}
