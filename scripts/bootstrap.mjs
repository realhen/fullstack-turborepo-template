import { copyFile, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const nameFlagIndex = process.argv.indexOf('--name')
const projectName =
  nameFlagIndex >= 0 ? process.argv[nameFlagIndex + 1] : undefined

if (
  !projectName ||
  projectName.length > 63 ||
  !/^[a-z](?:[a-z0-9-]*[a-z0-9])?$/.test(projectName)
) {
  console.error('Usage: pnpm bootstrap --name my-app')
  console.error(
    'Names must be at most 63 characters, start with a lowercase letter, end with a lowercase letter or number, and contain only lowercase letters, numbers, or hyphens.',
  )
  process.exitCode = 1
} else {
  const packagePath = path.join(repoRoot, 'package.json')
  const cdkPath = path.join(repoRoot, 'apps/infra/cdk.json')
  const readmePath = path.join(repoRoot, 'README.md')

  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
  packageJson.name = projectName
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)

  const cdkJson = JSON.parse(await readFile(cdkPath, 'utf8'))
  cdkJson.context.projectName = projectName
  await writeFile(cdkPath, `${JSON.stringify(cdkJson, null, 2)}\n`)

  const readme = await readFile(readmePath, 'utf8')
  await writeFile(
    readmePath,
    readme.replace('# Full-stack Turborepo Template', `# ${projectName}`),
  )

  for (const app of ['api', 'web']) {
    const source = path.join(repoRoot, `apps/${app}/.env.example`)
    const destination = path.join(repoRoot, `apps/${app}/.env`)
    try {
      await copyFile(source, destination, 1)
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
    }
  }

  console.log(`Bootstrapped ${projectName}. Next: pnpm install && pnpm dev`)
}
