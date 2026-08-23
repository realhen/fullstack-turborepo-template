import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Button } from './button'

describe('Button', () => {
  it('uses safe defaults and the selected intent', () => {
    const markup = renderToStaticMarkup(
      <Button intent="secondary">Save project</Button>,
    )

    expect(markup).toContain('type="button"')
    expect(markup).toContain('bg-zinc-900')
    expect(markup).toContain('Save project')
  })
})
