import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  DisabledAuthenticationAdapter,
  LocalTokenAuthenticationAdapter,
  OidcJwksAuthenticationAdapter,
  type AuthenticationAdapter,
} from './auth/authentication.adapter'
import {
  AUTHENTICATION_ADAPTER,
  AuthenticationService,
} from './auth/authentication.service'
import { ScopeGuard } from './auth/scope.guard'
import { InMemoryProjectMembershipStore } from './projects/in-memory-project-membership.store'
import { MeController } from './projects/me.controller'
import { ProjectIdPipe } from './projects/project-id.pipe'
import { ProjectsController } from './projects/projects.controller'
import { ProjectService } from './projects/project.service'
import { PROJECT_MEMBERSHIP_STORE } from './projects/project.types'

@Module({
  controllers: [MeController, ProjectsController],
  providers: [
    {
      provide: AUTHENTICATION_ADAPTER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AuthenticationAdapter => {
        const mode = config.getOrThrow<string>('AUTH_MODE')
        if (mode === 'disabled') {
          return new DisabledAuthenticationAdapter()
        }
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
    AuthenticationService,
    ScopeGuard,
    ProjectIdPipe,
    {
      provide: PROJECT_MEMBERSHIP_STORE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        if (config.getOrThrow<string>('AUTH_MODE') !== 'local') {
          return new InMemoryProjectMembershipStore()
        }
        return new InMemoryProjectMembershipStore([
          {
            project: {
              id: config.getOrThrow<string>('AUTH_LOCAL_PROJECT_ID'),
              name: config.getOrThrow<string>('AUTH_LOCAL_PROJECT_NAME'),
            },
            role: 'owner',
            userId: config.getOrThrow<string>('AUTH_LOCAL_SUBJECT'),
          },
        ])
      },
    },
    ProjectService,
  ],
  exports: [
    AUTHENTICATION_ADAPTER,
    AuthenticationService,
    ProjectService,
    PROJECT_MEMBERSHIP_STORE,
  ],
})
export class SaasModule {}
