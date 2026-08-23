import { spawnSync } from 'node:child_process'

function run(command, arguments_) {
  const result = spawnSync(command, arguments_, { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run('pnpm', [
  '--filter',
  '@repo/api',
  'openapi:generate',
  '--output',
  'packages/api-client/openapi.json',
])
run('pnpm', ['--filter', '@repo/api-client', 'generate'])
