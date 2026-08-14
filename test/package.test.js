import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const pkgRoot = join(root, '..')

describe('dsh-web-access package', () => {
  it('reserves the unscoped npm name', () => {
    const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'))
    assert.equal(pkg.name, 'dsh-web-access')
    assert.equal(pkg.publishConfig.access, 'public')
    assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  })

  it('exports a Cordis plugin entry', async () => {
    const mod = await import(pathToFileURL(join(pkgRoot, 'index.js')).href)
    assert.equal(mod.name, 'dsh-web-access')
    assert.equal(typeof mod.apply, 'function')
    assert.doesNotThrow(() => mod.apply())
  })
})
