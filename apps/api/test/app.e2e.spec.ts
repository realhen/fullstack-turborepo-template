import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('API', () => {
  let app: NestExpressApplication

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    process.env.ENABLE_SWAGGER = 'true'
    process.env.AUTH_MODE = 'local'
    process.env.AUTH_LOCAL_TOKEN =
      'test-token-that-is-long-enough-for-validation'
    process.env.AUTH_LOCAL_SUBJECT = 'test-user'
    process.env.AUTH_LOCAL_SCOPES = 'profile:read'
    process.env.AUTH_LOCAL_PROJECT_ID = 'test-project'
    process.env.AUTH_LOCAL_PROJECT_NAME = 'Test project'
    const { createApp } = await import('../src/bootstrap.js')
    app = await createApp()
    await app.init()
  })

  afterAll(async () => {
    if (app) await app.close()
  })

  it('reports healthy', async () => {
    const server = app.getHttpServer()
    const response = await request(server).get('/api/v1/health').expect(200)

    expect(response.body).toEqual({ service: 'api', status: 'ok' })
  })

  it('uses the ALB client address and serves Swagger with a compatible CSP', async () => {
    const server = app.getHttpServer()
    const express = app.getHttpAdapter().getInstance()
    const response = await request(server).get('/api/docs/').expect(200)

    expect(express.get('trust proxy')).toBe(1)
    expect(response.text).toContain('swagger-ui-bundle.js')
    expect(response.headers['content-security-policy']).toContain(
      "script-src 'self' 'unsafe-inline'",
    )
    expect(response.headers['content-security-policy']).not.toContain(
      'upgrade-insecure-requests',
    )
  })

  it('rate limits API requests but not load balancer health checks', async () => {
    const server = app.getHttpServer()
    const apiResponses = []
    const healthResponses = []
    for (let index = 0; index < 101; index += 1) {
      apiResponses.push(await request(server).get('/api/v1/'))
      healthResponses.push(await request(server).get('/api/v1/health'))
    }

    expect(
      apiResponses.filter((response) => response.status === 429),
    ).toHaveLength(1)
    expect(healthResponses.every((response) => response.status === 200)).toBe(
      true,
    )
  })

  it('requires authentication for the current-user endpoint', async () => {
    const server = app.getHttpServer()
    await request(server)
      .get('/api/v1/me')
      .set('X-Forwarded-For', '203.0.113.42')
      .expect(401)

    const response = await request(server)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${process.env.AUTH_LOCAL_TOKEN}`)
      .set('X-Forwarded-For', '203.0.113.42')
      .expect(200)

    expect(response.body).toMatchObject({
      id: 'test-user',
      provider: 'local',
      scopes: ['profile:read'],
    })
  })

  it('authorizes project operations through membership roles', async () => {
    const server = app.getHttpServer()
    const authorization = `Bearer ${process.env.AUTH_LOCAL_TOKEN}`

    await request(server)
      .get('/api/v1/projects/not a valid project')
      .set('Authorization', authorization)
      .set('X-Forwarded-For', '203.0.113.43')
      .expect(400)

    const project = await request(server)
      .get('/api/v1/projects/test-project')
      .set('Authorization', authorization)
      .set('X-Forwarded-For', '203.0.113.43')
      .expect(200)
    expect(project.body).toEqual({
      project: { id: 'test-project', name: 'Test project' },
      role: 'owner',
    })

    await request(server)
      .post('/api/v1/projects/test-project/members')
      .set('Authorization', authorization)
      .set('X-Forwarded-For', '203.0.113.43')
      .send({ userId: 'another-user', role: 'viewer' })
      .expect(201)

    const members = await request(server)
      .get('/api/v1/projects/test-project/members')
      .set('Authorization', authorization)
      .set('X-Forwarded-For', '203.0.113.43')
      .expect(200)
    expect(members.body).toHaveLength(2)
  })
})
