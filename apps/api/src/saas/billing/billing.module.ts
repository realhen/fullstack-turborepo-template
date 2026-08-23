import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createDatabase, databaseUrlFromEnvironment } from '@repo/database'
import { BillingController } from './billing.controller'
import { ControlledPlanCatalog } from './billing.catalog'
import { BillingProjectionProcessor } from './billing-projection.processor'
import { BillingService } from './billing.service'
import {
  BILLING_OUTBOX,
  BILLING_ORGANIZATION_MEMBERSHIP_STORE,
  BILLING_PROVIDER,
  BILLING_REPOSITORY,
  BILLING_STORE,
  type BillingPlan,
  type BillingProvider,
} from './billing.types'
import { BillingWebhookController } from './billing-webhook.controller'
import { BillingWorkerController } from './billing-worker.controller'
import { DisabledBillingProvider } from './disabled-billing.provider'
import {
  DatabaseBillingOrganizationMembershipStore,
  PostgresBillingStore,
} from './database-billing.store'
import {
  InMemoryBillingOrganizationMembershipStore,
  InMemoryBillingStore,
} from './in-memory-billing.store'
import { LocalBillingProvider } from './local-billing.provider'
import { StripeBillingProvider } from './stripe-billing.provider'

@Module({
  controllers: [BillingController, BillingWebhookController, BillingWorkerController],
  providers: [
    {
      provide: BILLING_STORE,
      useFactory: () => {
        const databaseUrl = databaseUrlFromEnvironment()
        return databaseUrl
          ? new PostgresBillingStore(createDatabase(databaseUrl).pool as never)
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
      providerPriceId: config.getOrThrow<string>('STRIPE_PRICE_STARTER_MONTHLY'),
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
