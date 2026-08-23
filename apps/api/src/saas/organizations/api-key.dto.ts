import {
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator'

export class CreateServiceAccountDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string

  @IsOptional()
  @IsUUID()
  projectId?: string
}

export class CreateApiKeyDto {
  @IsUUID()
  serviceAccountId!: string

  @IsArray()
  @IsString({ each: true })
  scopes!: string[]

  @IsOptional()
  @IsISO8601()
  expiresAt?: string
}
