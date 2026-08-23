import path from 'node:path'
import * as cdk from 'aws-cdk-lib'
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets'
import * as ecs from 'aws-cdk-lib/aws-ecs'

export const REPOSITORY_IMAGE_EXCLUDES = [
  '**/.next/**',
  '**/.turbo/**',
  '**/cdk.out/**',
  '**/dist/**',
  '**/node_modules/**',
  '.git/**',
]

export interface RepositoryImageOptions {
  dockerfile: string
  repoRoot?: string
  target?: string
}

export function createRepositoryImage(
  options: RepositoryImageOptions,
): ecs.ContainerImage {
  return ecs.ContainerImage.fromAsset(
    options.repoRoot ?? path.resolve(import.meta.dirname, '../../../..'),
    {
      exclude: REPOSITORY_IMAGE_EXCLUDES,
      file: options.dockerfile,
      ignoreMode: cdk.IgnoreMode.GLOB,
      platform: ecrAssets.Platform.LINUX_AMD64,
      target: options.target,
    },
  )
}
