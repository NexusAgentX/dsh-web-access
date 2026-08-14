import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { generateId, getResult, setActiveSession, storeResult } from '../src/storage.ts'

describe('session-scoped search cache', () => {
  it('isolates results across sessions and restores from disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-web-access-session-'))
    const previous = process.env.PI_CODING_AGENT_DIR
    process.env.PI_CODING_AGENT_DIR = dir
    try {
      const id = generateId()
      setActiveSession('session-a')
      storeResult(id, {
        id,
        type: 'search',
        timestamp: Date.now(),
        queries: [{ query: 'alpha', answer: 'A', results: [], error: null }],
      })
      assert.equal(getResult(id)?.queries?.[0]?.query, 'alpha')

      setActiveSession('session-b')
      assert.equal(getResult(id), null)

      setActiveSession('session-a')
      assert.equal(getResult(id)?.queries?.[0]?.answer, 'A')
    } finally {
      if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR
      else process.env.PI_CODING_AGENT_DIR = previous
      await rm(dir, { recursive: true, force: true })
    }
  })
})
