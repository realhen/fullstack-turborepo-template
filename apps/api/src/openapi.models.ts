import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

/** Stable response models exported through the generated frontend client. */
export class Health {
  @ApiProperty({ enum: ['api'], type: String })
  service!: 'api'

  @ApiProperty({ enum: ['ok'], type: String })
  status!: 'ok'
}

export class Principal {
  @ApiProperty({ type: String })
  id!: string

  @ApiPropertyOptional({ format: 'email', type: String })
  email?: string

  @ApiPropertyOptional({ type: Boolean })
  emailVerified?: boolean

  @ApiProperty({ type: String })
  provider!: string

  @ApiProperty({ isArray: true, type: String })
  scopes!: string[]

  @ApiPropertyOptional({ type: String })
  userId?: string
}

export class Project {
  @ApiProperty({ type: String })
  id!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiPropertyOptional({ type: String })
  organizationId?: string
}

export class ProjectMembership {
  @ApiProperty({ type: () => Project })
  project!: Project

  @ApiProperty({ enum: ['owner', 'admin', 'member', 'viewer'], type: String })
  role!: 'owner' | 'admin' | 'member' | 'viewer'

  @ApiProperty({ type: String })
  userId!: string
}
