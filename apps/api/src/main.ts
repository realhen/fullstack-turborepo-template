import { ConfigService } from '@nestjs/config'
import { createApp } from './bootstrap'
import type { Environment } from './env'

async function bootstrap(): Promise<void> {
  const app = await createApp()
  const config = app.get<ConfigService<Environment, true>>(ConfigService)

  await app.listen(config.get('PORT', { infer: true }), '0.0.0.0')
}

bootstrap().catch((error: unknown) => {
  console.error('API failed to start', error)
  process.exitCode = 1
})
