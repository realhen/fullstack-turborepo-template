import type { INestApplication } from '@nestjs/common'
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger'
import { Health, Principal, Project, ProjectMembership } from './openapi.models'

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('SaaS Application API')
    .setDescription(
      'Versioned contract used to generate every frontend-to-backend request.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build()

  return SwaggerModule.createDocument(app, config, {
    extraModels: [Health, Principal, Project, ProjectMembership],
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  })
}
