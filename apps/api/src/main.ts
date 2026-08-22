import 'reflect-metadata'
import { VersioningType, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import compression from 'compression'
import helmet from 'helmet'
import { AppModule } from './app.module'
import type { Environment } from './env'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  const config = app.get<ConfigService<Environment, true>>(ConfigService)
  const corsOrigin = config.get('CORS_ORIGIN', { infer: true })
  const enableSwagger = config.get('ENABLE_SWAGGER', { infer: true })

  app.enableShutdownHooks()
  app.setGlobalPrefix('api')
  app.enableVersioning({
    defaultVersion: '1',
    type: VersioningType.URI,
  })
  app.use(helmet())
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

  await app.listen(config.get('PORT', { infer: true }), '0.0.0.0')
}

bootstrap().catch((error: unknown) => {
  console.error('API failed to start', error)
  process.exitCode = 1
})
