import { Test } from '@nestjs/testing'
import { describe, expect, it } from 'vitest'
import { AuthenticationService } from './auth/application/authentication.service'
import { BillingService } from './billing/application/billing.service'
import { AppModule } from './app.module'
import { ProjectService } from './projects/application/project.service'

describe('AppModule', () => {
  it('composes top-level feature modules without a legacy wrapper', async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()
    expect(module.get(AuthenticationService)).toBeInstanceOf(
      AuthenticationService,
    )
    expect(module.get(ProjectService)).toBeInstanceOf(ProjectService)
    expect(module.get(BillingService)).toBeInstanceOf(BillingService)
    await module.close()
  })
})
