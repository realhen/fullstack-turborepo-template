import { cp, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const packageRoot = resolve(import.meta.dirname, '..')
const target = resolve(packageRoot, 'dist', 'migrations')

await mkdir(target, { recursive: true })
await cp(resolve(packageRoot, 'migrations'), target, { recursive: true })
