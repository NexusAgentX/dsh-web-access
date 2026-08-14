import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { generateCuratorPage } from '../src/curator-page.ts'
import { CURATOR_MOUNT_PATH, curatorPageUrl, setCuratorPublicOrigin } from '../src/curator-mount.ts'

const providers = {
  all: true, openai: false, brave: false, parallel: false, tinyfish: false, search1api: false,
  searchinfinity: false, querit: false, tavily: false, firecrawl: false, jina: false, serpdive: false,
  kagi: false, bocha: false, ollama: false, searxng: false, duckduckgo: false, perplexity: false,
  exa: true, gemini: false, anysearch: false, xai: false, brightdata: false, serpbase: false,
}

describe('curator mount', () => {
  it('prefixes API calls when served under the dsh web route', () => {
    const page = generateCuratorPage([], 'tok', 20, providers, 'exa', 'exa', [], null, CURATOR_MOUNT_PATH)
    assert.equal(page.includes('dsh-web-access/curator'), true)
    assert.equal(page.includes('apiUrl("/events")'), true)
  })

  it('builds a same-origin curator URL', () => {
    setCuratorPublicOrigin('http://127.0.0.1:3080')
    assert.equal(curatorPageUrl('abc'), 'http://127.0.0.1:3080/dsh-web-access/curator/?session=abc')
    setCuratorPublicOrigin('')
  })
})
