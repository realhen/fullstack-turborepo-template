import * as cdk from 'aws-cdk-lib'
import { describe, expect, it } from 'vitest'
import { createInfrastructureApp } from '../app.js'

function createApp(
  context: Record<string, string> = {
    domainName: 'api.example.com',
    projectName: 'fullstack-app',
    webOrigin: 'https://app.example.com',
  },
): cdk.App {
  return new cdk.App({ context })
}

describe('createInfrastructureApp', () => {
  it('composes CLI-addressable foundation, API, and worker stacks', () => {
    const { apiStack, foundationStack, workerStack } =
      createInfrastructureApp(createApp())

    expect(foundationStack.node.id).toBe('foundation-stack')
    expect(apiStack.node.id).toBe('api-stack')
    expect(workerStack.node.id).toBe('worker-stack')
    expect(foundationStack.stackName).toBe('fullstack-app-foundation')
    expect(apiStack.stackName).toBe('fullstack-app-api')
    expect(workerStack.stackName).toBe('fullstack-app-worker')

    expect(apiStack.dependencies).toContain(foundationStack)
    expect(workerStack.dependencies).toContain(foundationStack)
    expect(apiStack.dependencies).not.toContain(workerStack)
    expect(workerStack.dependencies).not.toContain(apiStack)
  })

  it('normalizes the API domain and frontend origin', () => {
    const { configuration } = createInfrastructureApp(
      createApp({
        domainName: 'api.example.com.',
        projectName: 'fullstack-app',
        webOrigin: 'https://app.example.com/',
      }),
    )

    expect(configuration.domainName).toBe('api.example.com')
    expect(configuration.webOrigin).toBe('https://app.example.com')
  })

  it('fails before composition when required context is missing', () => {
    expect(() =>
      createInfrastructureApp(
        createApp({
          projectName: 'fullstack-app',
          webOrigin: 'https://app.example.com',
        }),
      ),
    ).toThrow(/domainName is required/)
    expect(() =>
      createInfrastructureApp(
        createApp({
          domainName: 'api.example.com',
          projectName: 'fullstack-app',
        }),
      ),
    ).toThrow(/webOrigin is required/)
  })

  it('fails before composition when OIDC context is incomplete', () => {
    expect(() =>
      createInfrastructureApp(
        createApp({
          authIssuer: 'https://identity.example.com',
          domainName: 'api.example.com',
          projectName: 'fullstack-app',
          webOrigin: 'https://app.example.com',
        }),
      ),
    ).toThrow(/OIDC authentication requires/)
  })
})
