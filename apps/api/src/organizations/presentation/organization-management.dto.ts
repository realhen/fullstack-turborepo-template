import { IsString, Matches, MaxLength, MinLength } from 'class-validator'

export class CreateOrganizationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string

  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{0,62}$/)
  slug!: string
}
