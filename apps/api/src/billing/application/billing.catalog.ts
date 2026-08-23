import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { BillingPlan } from '../domain/billing.types'

const localPlans: readonly BillingPlan[] = [
  {
    code: 'starter-monthly',
    displayName: 'Starter Monthly',
    entitlementKeys: ['projects'],
    interval: 'month',
    providerPriceId: 'local_price_starter_monthly',
  },
  {
    code: 'pro-monthly',
    displayName: 'Pro Monthly',
    entitlementKeys: ['projects', 'exports'],
    interval: 'month',
    providerPriceId: 'local_price_pro_monthly',
  },
]

@Injectable()
export class ControlledPlanCatalog {
  private readonly plans = new Map<string, BillingPlan>()

  constructor(plans: readonly BillingPlan[] = localPlans) {
    for (const plan of plans) {
      if (this.plans.has(plan.code)) {
        throw new BadRequestException(`Duplicate billing plan: ${plan.code}`)
      }
      this.plans.set(plan.code, plan)
    }
  }

  get(planCode: string): BillingPlan {
    const plan = this.plans.get(planCode)
    if (!plan) throw new NotFoundException('Billing plan was not found')
    return plan
  }

  list(): BillingPlan[] {
    return [...this.plans.values()]
  }
}
