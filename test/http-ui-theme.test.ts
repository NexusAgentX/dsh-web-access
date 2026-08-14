import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

describe('web overlay theme', () => {
  it('uses official dsw tokens instead of hardcoded zinc colors', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/http-ui.ts', import.meta.url)), 'utf8')
    assert.match(src, /--dsw-alias-bg-layer-2/)
    assert.match(src, /--dsw-alias-button-floating-fill/)
    assert.match(src, /--dsw-alias-button-primary-fill/)
    assert.match(src, /--dsw-alias-bg-mask-1/)
    assert.match(src, /border-radius: 24px/)
    assert.match(src, /--dsw-font-family/)
    assert.doesNotMatch(src, /background: #111/)
    assert.doesNotMatch(src, /#2563eb/)
  })
})
