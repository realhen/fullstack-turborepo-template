import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuditModule } from './audit/audit.module'
import { AuthModule } from './auth/auth.module'
import { BillingModule } from './billing/billing.module'
import { ScopeGuard } from './common/guards/scope.guard'
import { DatabaseModule } from './database/database.module'
import { validateEnvironment } from './env'
import { HealthController } from './health/health.controller'
import { OrganizationsModule } from './organizations/organizations.module'
import { ProjectsModule } from './projects/projects.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([
      {
        limit: 100,
        ttl: 60_000,
      },
    ]),
    DatabaseModule,
    AuthModule,
    OrganizationsModule,
    ProjectsModule,
    AuditModule,
    BillingModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ScopeGuard,
    },
  ],
})
export class AppModule {}
