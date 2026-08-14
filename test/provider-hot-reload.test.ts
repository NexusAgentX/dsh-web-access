import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { applyPublicConfig } from '../src/public-config.ts'
import { resetConfigCache } from '../src/config.ts'
import { isGeminiApiAvailable } from '../src/gemini-api.ts'

describe('provider key hot reload', () => {
  it('picks up a newly saved Gemini key without process restart', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-web-access-hot-reload-'))
    const previousDir = process.env.PI_CODING_AGENT_DIR
    const previousKey = process.env.GEMINI_API_KEY
    delete process.env.GEMINI_API_KEY
    process.env.PI_CODING_AGENT_DIR = dir
    resetConfigCache()
    await writeFile(join(dir, 'web-search.json'), '{}\n')
    try {
      assert.equal(isGeminiApiAvailable(), false)
      applyPublicConfig({ geminiApiKey: 'AIza-test-hot-reload' })
      assert.equal(isGeminiApiAvailable(), true)
    } finally {
      if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR
      else process.env.PI_CODING_AGENT_DIR = previousDir
      if (previousKey === undefined) delete process.env.GEMINI_API_KEY
      else process.env.GEMINI_API_KEY = previousKey
      resetConfigCache()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
