import { IsEmail, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator'

export class CreateInvitationDto {
  @IsEmail()
  email!: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  expiresInDays?: number

  @IsOptional()
  @IsUUID()
  projectId?: string

  @IsOptional()
  @IsUUID()
  roleId?: string
}

export class AcceptInvitationDto {
  @IsString()
  token!: string
}
