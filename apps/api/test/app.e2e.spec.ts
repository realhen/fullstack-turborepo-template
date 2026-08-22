import { VersioningType } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import type { Server } from 'node:http'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module'

describe('API', () => {
  let app: INestApplication

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()
    app.setGlobalPrefix('api')
    app.enableVersioning({ defaultVersion: '1', type: VersioningType.URI })
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('reports healthy', async () => {
    const server = app.getHttpServer() as Server
    const response = await request(server).get('/api/v1/health').expect(200)

    expect(response.body).toEqual({ service: 'api', status: 'ok' })
  })
})
