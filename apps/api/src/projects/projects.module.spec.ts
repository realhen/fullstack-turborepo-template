import { ConfigModule } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { describe, expect, it } from 'vitest'
import { AuthModule } from '../auth/auth.module'
import { DatabaseModule } from '../database/database.module'
import { OrganizationsModule } from '../organizations/organizations.module'
import { ProjectService } from './application/project.service'
import { ProjectsModule } from './projects.module'

describe('ProjectsModule', () => {
  it('provides ProjectService', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        AuthModule,
        OrganizationsModule,
        ProjectsModule,
      ],
    }).compile()
    expect(module.get(ProjectService)).toBeInstanceOf(ProjectService)
    await module.close()
  })
})
