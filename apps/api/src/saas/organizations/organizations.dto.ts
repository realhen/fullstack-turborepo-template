import { IsInt, IsOptional, Max, Min } from 'class-validator'

export class ListOrganizationsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50
}
