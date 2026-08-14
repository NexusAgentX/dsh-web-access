import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { registerWebUi } from '../src/http-ui.ts'
import { createEngine } from '../src/engine.ts'

describe('web overlay routes', () => {
  it('registers API and curator routes on webServer', () => {
    const routes: Array<{ kind: string; path: string }> = []
    const ctx = {
      webServer: {
        port: 3080,
        register(route: { kind: string; path: string }) {
          routes.push({ kind: route.kind, path: route.path })
          return () => {}
        },
        tapIndex() {
          return () => {}
        },
      },
      get(name: string) {
        return name === 'webServer' ? this.webServer : undefined
      },
      effect(factory: () => () => void) {
        factory()
        return () => {}
      },
    }
    registerWebUi(ctx as never, createEngine())
    assert.deepEqual(routes.map(route => route.path).sort(), [
      '/dsh-web-access/api/activity',
      '/dsh-web-access/api/config',
      '/dsh-web-access/api/status',
      '/dsh-web-access/curator',
      '/dsh-web-access/panel',
      '/dsh-web-access/ui.js',
    ])
  })
})
