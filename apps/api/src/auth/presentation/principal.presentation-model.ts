import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

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
