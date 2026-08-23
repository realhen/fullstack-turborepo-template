import { ApiProperty } from '@nestjs/swagger'

export class Health {
  @ApiProperty({ enum: ['api'], type: String })
  service!: 'api'

  @ApiProperty({ enum: ['ok'], type: String })
  status!: 'ok'
}
