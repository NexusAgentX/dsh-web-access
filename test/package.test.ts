import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { inject, name } from '../src/index.ts'
import { createEngine, executeGetSearchContent } from '../src/engine.ts'
import { generateId, storeResult } from '../src/storage.ts'

const root = dirname(fileURLToPath(import.meta.url))

describe('dsh-web-access package', () => {
  it('exports the Cordis plugin name', () => {
    const pkg = JSON.parse(readFileSync(join(root, '..', 'package.json'), 'utf8')) as { name: string }
    assert.equal(pkg.name, 'dsh-web-access')
    assert.equal(name, 'dsh-web-access')
    assert.deepEqual(inject, ['tools', 'web'])
    const plugin = readFileSync(join(root, '..', 'src/plugin.ts'), 'utf8')
    assert.match(plugin, /ctx\.inject\(\['webServer'\]/)
  })

  it('retrieves stored search results', () => {
    const engine = createEngine()
    const id = generateId()
    storeResult(id, {
      id,
      type: 'search',
      timestamp: Date.now(),
      queries: [{
        query: 'hello',
        answer: 'world',
        results: [{ title: 'Example', url: 'https://example.com', snippet: 'hi' }],
        error: null,
        provider: 'exa',
      }],
    })
    const result = executeGetSearchContent(engine, { responseId: id, query: 'hello' })
    assert.match(result.text, /Example/)
    assert.equal(result.details.resultCount, 1)
  })
})
