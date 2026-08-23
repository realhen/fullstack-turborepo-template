import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

process.env.NODE_ENV = 'test'
process.env.ENABLE_SWAGGER = 'false'
process.env.AUTH_MODE = 'disabled'
process.env.BILLING_PROVIDER ??= 'local'

const [{ createApp }, { createOpenApiDocument }] = await Promise.all([
  import('../src/bootstrap.js'),
  import('../src/openapi.js'),
])

const app = await createApp()
try {
  await app.init()
  const document = createOpenApiDocument(app)
  const destination = path.resolve(
    import.meta.dirname,
    '../../../packages/api-client/openapi.json',
  )
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(destination, `${JSON.stringify(document, null, 2)}\n`)
  console.log(`Generated ${destination}`)
} finally {
  await app.close()
}

