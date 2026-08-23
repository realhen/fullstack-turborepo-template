import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

/** Stable response models exported through the generated frontend client. */
export class Health {
  @ApiProperty({ enum: ['api'] })
  service!: 'api'

  @ApiProperty({ enum: ['ok'] })
  status!: 'ok'
}

export class Principal {
  @ApiProperty()
  id!: string

  @ApiPropertyOptional({ format: 'email' })
  email?: string

  @ApiPropertyOptional()
  emailVerified?: boolean

  @ApiProperty()
  provider!: string

  @ApiProperty({ isArray: true, type: String })
  scopes!: string[]

  @ApiPropertyOptional()
  userId?: string
}

export class Project {
  @ApiProperty()
  id!: string

  @ApiProperty()
  name!: string

  @ApiPropertyOptional()
  organizationId?: string
}

export class ProjectMembership {
  @ApiProperty({ type: () => Project })
  project!: Project

  @ApiProperty({ enum: ['owner', 'admin', 'member', 'viewer'] })
  role!: 'owner' | 'admin' | 'member' | 'viewer'

  @ApiProperty()
  userId!: string
}
