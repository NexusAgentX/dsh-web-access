import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { resetConfigCache } from '../src/config.ts'
import { applyPublicConfig, getPublicConfig } from '../src/public-config.ts'

describe('public config', () => {
  it('masks secrets and accepts updates', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-web-access-public-config-'))
    const previous = process.env.PI_CODING_AGENT_DIR
    process.env.PI_CODING_AGENT_DIR = dir
    resetConfigCache()
    try {
      applyPublicConfig({ workflow: 'none', openaiApiKey: 'sk-test' })
      const shown = getPublicConfig()
      assert.equal(shown.workflow, 'none')
      assert.equal((shown.keys as { openaiApiKey?: boolean }).openaiApiKey, true)
      assert.equal(shown.openaiApiKey, undefined)
    } finally {
      if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR
      else process.env.PI_CODING_AGENT_DIR = previous
      resetConfigCache()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
