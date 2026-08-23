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
    process.env.AUTH_LOCAL_PROJECT_ID = '00000000-0000-4000-8000-000000000012'
    process.env.AUTH_LOCAL_PROJECT_NAME = 'Test project'
    process.env.WORKER_SECRET = 'test-worker-secret-that-is-long-enough'
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

  it('returns a stable error envelope and propagates safe request IDs', async () => {
    const server = app.getHttpServer()
    const response = await request(server)
      .get('/api/v1/does-not-exist')
      .set('X-Request-Id', 'integration-request-123')
      .expect(404)

    expect(response.headers['x-request-id']).toBe('integration-request-123')
    expect(response.body).toEqual({
      error: {
        code: 'not_found',
        message: 'Cannot GET /api/v1/does-not-exist',
        requestId: 'integration-request-123',
      },
    })
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
  }, 15_000)

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

  it('rejects malformed authenticated internal billing jobs', async () => {
    const server = app.getHttpServer()
    await request(server)
      .post('/api/v1/internal/billing/jobs')
      .set('X-Worker-Secret', process.env.WORKER_SECRET!)
      .send({ kind: 'billing.webhook' })
      .expect(400)
  })

  it('does not throttle authenticated internal billing jobs', async () => {
    const server = app.getHttpServer()
    const responses = []
    for (let index = 0; index < 101; index += 1) {
      responses.push(
        await request(server)
          .post('/api/v1/internal/billing/jobs')
          .set('X-Forwarded-For', '203.0.113.99')
          .set('X-Worker-Secret', process.env.WORKER_SECRET!)
          .send({ eventId: `evt-backlog-${index}`, kind: 'billing.webhook' }),
      )
    }

    expect(responses.every((response) => response.status === 204)).toBe(true)
    expect(responses.some((response) => response.status === 429)).toBe(false)
  }, 15_000)

  it('authorizes project operations through membership roles', async () => {
    const server = app.getHttpServer()
    const authorization = `Bearer ${process.env.AUTH_LOCAL_TOKEN}`

    await request(server)
      .get('/api/v1/projects/not a valid project')
      .set('Authorization', authorization)
      .set('X-Forwarded-For', '203.0.113.43')
      .expect(400)

    const project = await request(server)
      .get('/api/v1/projects/00000000-0000-4000-8000-000000000012')
      .set('Authorization', authorization)
      .set('X-Forwarded-For', '203.0.113.43')
      .expect(200)
    expect(project.body).toEqual({
      project: {
        id: '00000000-0000-4000-8000-000000000012',
        name: 'Test project',
        organizationId: '00000000-0000-4000-8000-000000000001',
      },
      role: 'owner',
    })

    await request(server)
      .post('/api/v1/projects/00000000-0000-4000-8000-000000000012/members')
      .set('Authorization', authorization)
      .set('X-Forwarded-For', '203.0.113.43')
      .send({ userId: 'another-user', role: 'viewer' })
      .expect(201)

    const members = await request(server)
      .get('/api/v1/projects/00000000-0000-4000-8000-000000000012/members')
      .set('Authorization', authorization)
      .set('X-Forwarded-For', '203.0.113.43')
      .expect(200)
    expect(members.body).toHaveLength(2)
  })
})
