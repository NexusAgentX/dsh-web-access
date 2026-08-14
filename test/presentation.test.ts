import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fetchMetaFromDetails, presentFetchResult, presentSearchResult, searchMetaFromDetails } from '../src/presentation.ts'

describe('web card presentation', () => {
  it('projects search sources into replayable meta', () => {
    const meta = searchMetaFromDetails({
      sources: [{ url: 'https://example.com', title: 'Example', snippet: 'hi' }],
      truncated: true,
      answer: 'yes',
    })
    assert.deepEqual(meta, {
      sources: [{ url: 'https://example.com', title: 'Example', snippet: 'hi' }],
      truncated: true,
      answer: 'yes',
    })
    const view = presentSearchResult({ query: 'hello' }, { isError: false, content: [], meta })
    assert.equal(view?.card, 'web')
    assert.equal(view?.kind, 'search')
    assert.equal(view?.title, 'hello')
    assert.equal(view?.sources.length, 1)
  })

  it('projects fetch status into a web card', () => {
    const meta = fetchMetaFromDetails({ url: 'https://example.com', status: 200, truncated: false })
    const view = presentFetchResult({ url: 'https://example.com' }, { isError: false, content: [], meta })
    assert.equal(view?.card, 'web')
    assert.equal(view?.kind, 'fetch')
    assert.equal(view?.statusCode, 200)
  })
})
