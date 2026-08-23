import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

async function generate(): Promise<void> {
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
    const outputIndex = process.argv.indexOf('--output')
    const requestedOutput =
      outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined
    if (outputIndex >= 0 && !requestedOutput) {
      throw new Error('--output requires a path')
    }
    const repositoryRoot = path.resolve(__dirname, '../../..')
    const destination = requestedOutput
      ? path.resolve(repositoryRoot, requestedOutput)
      : path.join(repositoryRoot, 'packages/api-client/openapi.json')
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, `${JSON.stringify(document, null, 2)}\n`)
    console.log(`Generated ${destination}`)
  } finally {
    await app.close()
  }
}

generate().catch((error: unknown) => {
  console.error('OpenAPI generation failed', error)
  process.exitCode = 1
})
