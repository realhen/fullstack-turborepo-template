import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Pool } from 'pg'
import { DATABASE_POOL } from '../database/database.constants'
import { DatabaseModule } from '../database/database.module'
import {
  AUTHENTICATION_ADAPTER,
  AuthenticationService,
} from './application/authentication.service'
import {
  IDENTITY_RESOLVER,
  type IdentityResolver,
} from './domain/identity-resolver'
import { DatabaseIdentityResolver } from './infrastructure/database-identity-resolver'
import {
  DisabledAuthenticationAdapter,
  LocalTokenAuthenticationAdapter,
  OidcJwksAuthenticationAdapter,
  type AuthenticationAdapter,
} from './infrastructure/authentication.adapter'

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: AUTHENTICATION_ADAPTER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AuthenticationAdapter => {
        const mode = config.get<string>('AUTH_MODE') ?? 'disabled'
        if (mode === 'disabled') return new DisabledAuthenticationAdapter()
        if (mode === 'oidc') {
          return new OidcJwksAuthenticationAdapter(
            config.getOrThrow<string>('AUTH_JWKS_URI'),
            config.getOrThrow<string>('AUTH_ISSUER'),
            config.get<string>('AUTH_AUDIENCE'),
            config.get<string>('AUTH_CLIENT_ID'),
          )
        }
        const email = config.get<string>('AUTH_LOCAL_EMAIL')
        return new LocalTokenAuthenticationAdapter(
          config.getOrThrow<string>('AUTH_LOCAL_TOKEN'),
          {
            id: config.getOrThrow<string>('AUTH_LOCAL_SUBJECT'),
            ...(email ? { email } : {}),
            provider: 'local',
            scopes: config
              .getOrThrow<string>('AUTH_LOCAL_SCOPES')
              .split(/\s*,\s*/)
              .filter(Boolean),
          },
        )
      },
    },
    {
      provide: IDENTITY_RESOLVER,
      inject: [DATABASE_POOL],
      useFactory: (pool: Pool | null): IdentityResolver =>
        pool
          ? new DatabaseIdentityResolver(pool)
          : {
              resolve: (principal) =>
                Promise.resolve({ ...principal, userId: principal.id }),
            },
    },
    AuthenticationService,
  ],
  exports: [AuthenticationService],
})
export class AuthModule {}
