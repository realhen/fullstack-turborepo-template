import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, IsUrl, Min } from 'class-validator'

export class CreateCheckoutDto {
  @IsString()
  planCode!: string

  @IsUrl({ require_tld: false })
  successUrl!: string

  @IsUrl({ require_tld: false })
  cancelUrl!: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number
}

export class CreatePortalDto {
  @IsUrl({ require_tld: false })
  returnUrl!: string
}
