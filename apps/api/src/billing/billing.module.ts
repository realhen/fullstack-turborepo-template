import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Pool } from 'pg'
import { DATABASE_POOL } from '../database/database.constants'
import { DatabaseModule } from '../database/database.module'
import { OrganizationsModule } from '../organizations/organizations.module'
import { ControlledPlanCatalog } from './application/billing.catalog'
import { BillingProjectionProcessor } from './application/billing-projection.processor'
import { BillingService } from './application/billing.service'
import {
  BILLING_OUTBOX,
  BILLING_ORGANIZATION_MEMBERSHIP_STORE,
  BILLING_PROVIDER,
  BILLING_REPOSITORY,
  BILLING_STORE,
  type BillingPlan,
  type BillingProvider,
} from './domain/billing.types'
import { BillingWebhookController } from './presentation/billing-webhook.controller'
import { BillingWorkerController } from './presentation/billing-worker.controller'
import { BillingController } from './presentation/billing.controller'
import { DisabledBillingProvider } from './infrastructure/disabled-billing.provider'
import {
  DatabaseBillingOrganizationMembershipStore,
  PostgresBillingStore,
} from './infrastructure/database-billing.store'
import {
  InMemoryBillingOrganizationMembershipStore,
  InMemoryBillingStore,
} from './infrastructure/in-memory-billing.store'
import { LocalBillingProvider } from './infrastructure/local-billing.provider'
import { StripeBillingProvider } from './infrastructure/stripe-billing.provider'

@Module({
  imports: [DatabaseModule, OrganizationsModule],
  controllers: [
    BillingController,
    BillingWebhookController,
    BillingWorkerController,
  ],
  providers: [
    {
      provide: BILLING_STORE,
      inject: [DATABASE_POOL],
      useFactory: (pool: Pool | null) => {
        return pool
          ? new PostgresBillingStore(pool)
          : new InMemoryBillingStore()
      },
    },
    {
      provide: BILLING_ORGANIZATION_MEMBERSHIP_STORE,
      inject: [ConfigService, BILLING_STORE],
      useFactory: (
        config: ConfigService,
        store: InMemoryBillingStore | PostgresBillingStore,
      ) =>
        store instanceof PostgresBillingStore
          ? new DatabaseBillingOrganizationMembershipStore(store.pool)
          : new InMemoryBillingOrganizationMembershipStore(
              config.get<string>('AUTH_MODE') === 'local'
                ? [
                    {
                      canManageBilling: true,
                      organizationId: config.getOrThrow<string>(
                        'AUTH_LOCAL_ORGANIZATION_ID',
                      ),
                      userId: config.getOrThrow<string>('AUTH_LOCAL_SUBJECT'),
                    },
                  ]
                : [],
            ),
    },
    {
      provide: BILLING_REPOSITORY,
      useExisting: BILLING_STORE,
    },
    {
      provide: BILLING_OUTBOX,
      useExisting: BILLING_STORE,
    },
    {
      provide: BILLING_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): BillingProvider => {
        const provider = config.get<string>('BILLING_PROVIDER') ?? 'disabled'
        if (provider === 'stripe') {
          return new StripeBillingProvider(
            config.getOrThrow<string>('STRIPE_SECRET_KEY'),
            config.getOrThrow<string>('STRIPE_WEBHOOK_SECRET'),
          )
        }
        if (provider === 'disabled') return new DisabledBillingProvider()
        if (provider !== 'local') {
          throw new Error(`Unsupported billing provider: ${provider}`)
        }
        return new LocalBillingProvider(
          config.get<string>('LOCAL_BILLING_WEBHOOK_SECRET'),
        )
      },
    },
    {
      provide: ControlledPlanCatalog,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        if (config.get<string>('BILLING_PROVIDER') !== 'stripe') {
          return new ControlledPlanCatalog()
        }
        return new ControlledPlanCatalog(stripePlans(config))
      },
    },
    BillingService,
    BillingProjectionProcessor,
  ],
  exports: [BillingProjectionProcessor, BillingService],
})
export class BillingModule {}

function stripePlans(config: ConfigService): BillingPlan[] {
  return [
    {
      code: 'starter-monthly',
      displayName: 'Starter Monthly',
      entitlementKeys: ['projects'],
      interval: 'month',
      providerPriceId: config.getOrThrow<string>(
        'STRIPE_PRICE_STARTER_MONTHLY',
      ),
    },
    {
      code: 'pro-monthly',
      displayName: 'Pro Monthly',
      entitlementKeys: ['projects', 'exports'],
      interval: 'month',
      providerPriceId: config.getOrThrow<string>('STRIPE_PRICE_PRO_MONTHLY'),
    },
  ]
}
