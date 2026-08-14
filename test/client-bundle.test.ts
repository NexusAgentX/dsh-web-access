import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('dsh.client bundle', () => {
  it('declares a web client export and ships the factory wrapper', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      dsh?: { client?: { platform?: string } }
      exports?: { './client'?: { default?: string } }
    }
    assert.equal(pkg.dsh?.client?.platform, 'web')
    const rel = pkg.exports?.['./client']?.default
    assert.equal(rel, './dist/client.js')
    const bundle = join(root, 'dist/client.js')
    if (!existsSync(bundle)) return
    const text = readFileSync(bundle, 'utf8')
    assert.equal(text.includes('window.__ModuleLoader__.load'), true)
    assert.equal(text.includes('shell.overlay'), true)
    assert.equal(text.includes('dsh-web-access'), true)
  })
})
