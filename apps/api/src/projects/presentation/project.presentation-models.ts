import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

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
