import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { parseHTML } from 'linkedom'

describe('linkedom Node 24 ESM', () => {
  it('pins a build whose facades import uses .js suffixes', () => {
    const require = createRequire(import.meta.url)
    const pkgPath = require.resolve('linkedom/package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string }
    assert.equal(pkg.version, '0.16.11')
    const facades = readFileSync(join(dirname(pkgPath), 'esm/shared/facades.js'), 'utf8')
    assert.match(facades, /cdata-section\.js/)
    assert.doesNotMatch(facades, /from '\.\.\/interface\/cdata-section'/)
  })

  it('parses HTML without throwing on plugin import', () => {
    const { document } = parseHTML('<html><body><p>ok</p></body></html>')
    assert.equal(document.querySelector('p')?.textContent, 'ok')
  })
})
