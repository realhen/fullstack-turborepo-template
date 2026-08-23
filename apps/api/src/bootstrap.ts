import 'reflect-metadata'
import { VersioningType, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import compression from 'compression'
import helmet from 'helmet'
import { AppModule } from './app.module'
import type { Environment } from './env'

export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  const config = app.get<ConfigService<Environment, true>>(ConfigService)
  const corsOrigin = config.get('CORS_ORIGIN', { infer: true })
  const enableSwagger = config.get('ENABLE_SWAGGER', { infer: true })

  // The API is reached through a single ALB hop. This lets Express use the
  // client address from X-Forwarded-For for IP-based throttling.
  app.getHttpAdapter().getInstance().set('trust proxy', 1)
  app.enableShutdownHooks()
  app.setGlobalPrefix('api')
  app.enableVersioning({
    defaultVersion: '1',
    type: VersioningType.URI,
  })

  const defaultHelmet = helmet()
  const swaggerHelmet = helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        scriptSrc: ["'self'", "'unsafe-inline'"],
        upgradeInsecureRequests: null,
      },
    },
  })

  app.use((request, response, next) => {
    const isSwaggerUiRequest =
      request.path === '/api/docs' || request.path.startsWith('/api/docs/')

    if (enableSwagger && isSwaggerUiRequest) {
      swaggerHelmet(request, response, next)
      return
    }

    defaultHelmet(request, response, next)
  })
  app.use(compression())
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  )

  if (corsOrigin) {
    app.enableCors({ credentials: true, origin: corsOrigin })
  }

  if (enableSwagger) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Application API')
      .setDescription('HTTP API for the full-stack application')
      .setVersion('1.0')
      .build()

    SwaggerModule.setup(
      'api/docs',
      app,
      SwaggerModule.createDocument(app, swaggerConfig),
    )
  }

  return app
}
