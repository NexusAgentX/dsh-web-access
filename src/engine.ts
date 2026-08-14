import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { platform } from 'node:os'
import { findContent, type FindMode } from './content-find.ts'
import {
  getMaxInlineContentChars,
  joinToolNames,
  loadConfigSafe,
  normalizeQueryList,
  resolveRequestedProvider,
  resolveToolNames,
  resolveWorkflow,
  type ToolNames,
  type WebSearchWorkflow,
} from './config.ts'
import type { ExtractedContent } from './extract.ts'
import { normalizeFetchContentParams } from './fetch-params.ts'
import { search, type SearchProviderSelection } from './gemini-search.ts'
import { createHostContext, type ExtensionContext } from './host.ts'
import { answerFromPage } from './page-query.ts'
import type { SearchResult } from './perplexity.ts'
import {
  buildResearchArtifact,
  getResearchArtifact,
  storeResearchArtifact,
  withClaimAssessment,
  type RecencyFilter,
} from './source-check.ts'
import {
  generateId,
  getAllResults,
  getResult,
  storeFetchedContentResult,
  storeResult,
  type QueryResultData,
  type StoredSearchData,
} from './storage.ts'
import { buildDeterministicSummary, generateSummaryDraft, type SummaryMeta } from './summary-review.ts'
import { startCuratorServer, type CuratorSearchEntry } from './curator-server.ts'
import { isGeminiWebAvailable, getActiveGoogleEmail } from './gemini-web.ts'
import { isBraveAvailable } from './brave.ts'
import { isOpenAISearchAvailable } from './openai-search.ts'
import { isParallelAvailable } from './parallel.ts'
import { isTinyFishAvailable } from './tinyfish.ts'
import { isSearch1APIAvailable } from './search1api.ts'
import { isSearchinfinityAvailable } from './searchinfinity.ts'
import { isQueritAvailable } from './querit.ts'
import { isTavilyAvailable } from './tavily.ts'
import { isFirecrawlAvailable } from './firecrawl.ts'
import { isJinaSearchAvailable } from './jina-search.ts'
import { isSerpdiveAvailable } from './serpdive.ts'
import { isKagiAvailable } from './kagi.ts'
import { isBochaAvailable } from './bocha.ts'
import { isOllamaAvailable } from './ollama.ts'
import { isSearXNGAvailable } from './searxng.ts'
import { isDuckDuckGoAvailable } from './duckduckgo.ts'
import { isAnySearchAvailable } from './anysearch.ts'
import { isXaiSearchAvailable } from './xai-search.ts'
import { isBrightDataAvailable } from './brightdata.ts'
import { isSerpBaseAvailable } from './serpbase.ts'
import { isExaAvailable } from './exa.ts'
import { isGeminiApiAvailable } from './gemini-api.ts'
import { isPerplexityAvailable } from './perplexity.ts'
import { resolveCuratorNetworkConfig } from './utils.ts'
import {
  DEFAULT_CURATOR_TIMEOUT_SECONDS,
  DEFAULT_REMOTE_CURATOR_TIMEOUT_SECONDS,
  MAX_CURATOR_TIMEOUT_SECONDS,
} from './config.ts'

let extractModulePromise: Promise<typeof import('./extract.ts')> | undefined

export interface ToolResult {
  text: string
  details: Record<string, unknown>
}

export interface Engine {
  names: ToolNames
  ctx: ExtensionContext
  defaultWorkflow: WebSearchWorkflow
}

const pendingFetches = new Map<string, AbortController>()

export function createEngine(ctx = createHostContext()): Engine {
  const config = loadConfigSafe()
  return {
    names: resolveToolNames(config),
    ctx,
    defaultWorkflow: resolveWorkflow(config.workflow, 'auto-summary'),
  }
}

export function disposeEngine(): void {
  for (const controller of pendingFetches.values()) controller.abort()
  pendingFetches.clear()
}

export async function fetchAllContent(
  urls: string[],
  signal?: AbortSignal,
  options?: Parameters<typeof import('./extract.ts').fetchAllContent>[2],
): Promise<ExtractedContent[]> {
  const extractModule = await (extractModulePromise ??= import('./extract.ts'))
  return extractModule.fetchAllContent(urls, signal, options)
}

function isAbortError(err: unknown): boolean {
  return (err instanceof Error ? err.message : String(err)).toLowerCase().includes('abort')
}

function normalizeRecencyFilter(value: unknown): RecencyFilter | undefined {
  return value === 'day' || value === 'week' || value === 'month' || value === 'year' ? value : undefined
}

function stripThumbnails(results: ExtractedContent[]): ExtractedContent[] {
  return results.map(({ thumbnail: _thumbnail, frames: _frames, ...rest }) => rest)
}

function initialContentSlice(content: string, maxChars: number): {
  text: string
  endOffset: number
  totalBytes: number
  totalLines: number
  shownBytes: number
  shownLines: number
} {
  let endOffset = Math.min(content.length, maxChars)
  if (endOffset < content.length) {
    const lineBreak = content.lastIndexOf('\n', endOffset)
    if (lineBreak >= Math.floor(maxChars * 0.8)) endOffset = lineBreak + 1
  }
  const text = content.slice(0, endOffset)
  return {
    text,
    endOffset,
    totalBytes: Buffer.byteLength(content),
    totalLines: content.length === 0 ? 0 : content.split('\n').length,
    shownBytes: Buffer.byteLength(text),
    shownLines: text.length === 0 ? 0 : text.split('\n').length,
  }
}

function normalizeFindQueries(value: string | string[]): string[] {
  const queries = (Array.isArray(value) ? value : [value]).map(query => query.trim()).filter(Boolean)
  if (queries.length === 0) throw new Error('findText must contain at least one non-empty string')
  return queries
}

function formatSearchSummary(results: SearchResult[], answer: string): string {
  if (results.length === 0) {
    return answer ? `${answer}\n\n---\n\n**Sources:**\nNo sources returned.` : 'No results found.'
  }
  let output = answer ? `${answer}\n\n---\n\n**Sources:**\n` : ''
  output += results.map((result, index) => `${index + 1}. ${result.title}\n   ${result.url}`).join('\n\n')
  return output
}

function formatSourceCheckResult(artifact: ReturnType<typeof withClaimAssessment>, tool: string | null): string {
  const assessment = artifact.claims?.[0]
  const lines = [`# Source check: ${artifact.query}`, '']
  if (assessment) {
    lines.push(`**Status:** ${assessment.status} (confidence ${assessment.confidence.toFixed(2)})`)
    lines.push(`**Rationale:** ${assessment.rationale}`)
    if (assessment.supporting_passages.length > 0) lines.push(`**Supporting passages:** ${assessment.supporting_passages.join(', ')}`)
    if (assessment.contradicting_passages.length > 0) lines.push(`**Contradicting passages:** ${assessment.contradicting_passages.join(', ')}`)
    lines.push('')
  }
  if (artifact.sources.length > 0) {
    lines.push('## Sources')
    for (const source of artifact.sources) lines.push(`${source.rank}. [${source.quality}] ${source.title}\n   ${source.url}`)
    lines.push('')
  }
  if (artifact.errors?.length) lines.push(`Search errors: ${artifact.errors.map(entry => `${entry.query}: ${entry.error}`).join('; ')}`)
  lines.push(tool
    ? `Artifact responseId: ${artifact.id} (retrievable via ${tool}).`
    : `Artifact responseId: ${artifact.id}. Content retrieval is not registered.`)
  return lines.join('\n')
}

function formatFullResults(queryData: QueryResultData): string {
  let output = `## Results for: "${queryData.query}"\n\n`
  if (queryData.answer) output += `${queryData.answer}\n\n---\n\n`
  for (const result of queryData.results) output += `### ${result.title}\n${result.url}\n\n`
  return output
}

function startBackgroundFetch(urls: string[]): string | null {
  if (urls.length === 0) return null
  const fetchId = generateId()
  const controller = new AbortController()
  pendingFetches.set(fetchId, controller)
  void fetchAllContent(urls, controller.signal)
    .then(fetched => {
      if (!pendingFetches.has(fetchId)) return
      storeFetchedContentResult(fetchId, {
        id: fetchId,
        type: 'fetch',
        timestamp: Date.now(),
        urls: stripThumbnails(fetched),
      })
    })
    .catch(() => undefined)
    .finally(() => { pendingFetches.delete(fetchId) })
  return fetchId
}

function buildSearchText(opts: {
  queryList: string[]
  results: QueryResultData[]
  approvedSummary?: string
}): string {
  if (opts.approvedSummary?.trim()) return opts.approvedSummary.trim()
  let output = ''
  for (const result of opts.results) {
    if (opts.queryList.length > 1) output += `## Query: "${result.query}"\n\n`
    output += result.error ? `Error: ${result.error}\n\n` : `${formatSearchSummary(result.results, result.answer)}\n\n`
  }
  return output.trim() || 'No results found.'
}

export async function executeWebSearch(engine: Engine, params: {
  query?: string
  queries?: string[]
  numResults?: number
  includeContent?: boolean
  recencyFilter?: string
  domainFilter?: string[]
  provider?: unknown
  workflow?: string
}, signal?: AbortSignal): Promise<ToolResult> {
  const queryList = normalizeQueryList(Array.isArray(params.queries) ? params.queries : params.query !== undefined ? [params.query] : [])
  if (queryList.length === 0) {
    return { text: "Error: No query provided. Use 'query' or 'queries' parameter.", details: { error: 'No query provided' } }
  }
  const workflow = resolveWorkflow(params.workflow ?? engine.defaultWorkflow, engine.defaultWorkflow)
  const recencyFilter = normalizeRecencyFilter(params.recencyFilter)
  if (workflow === 'summary-review') {
    return executeCuratedSearch(engine, {
      queryList,
      numResults: params.numResults,
      includeContent: params.includeContent ?? false,
      recencyFilter,
      domainFilter: params.domainFilter,
      provider: params.provider,
    }, signal)
  }

  const searchResults: QueryResultData[] = []
  const allUrls: string[] = []
  const allInlineContent: ExtractedContent[] = []
  const resolvedProvider = resolveRequestedProvider(params.provider)

  for (const query of queryList) {
    if (signal?.aborted) break
    try {
      const response = await search(query, {
        provider: resolvedProvider,
        numResults: params.numResults,
        recencyFilter,
        domainFilter: params.domainFilter,
        includeContent: params.includeContent,
        signal,
        extensionContext: engine.ctx,
      })
      searchResults.push({ query, answer: response.answer, results: response.results, error: null, provider: response.provider })
      for (const result of response.results) {
        if (!allUrls.includes(result.url)) allUrls.push(result.url)
      }
      if (response.inlineContent) allInlineContent.push(...response.inlineContent)
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) throw error
      searchResults.push({
        query,
        answer: '',
        results: [],
        error: error instanceof Error ? error.message : String(error),
        provider: typeof resolvedProvider === 'string' ? resolvedProvider : undefined,
      })
    }
  }

  let approvedSummary: string | undefined
  let summaryMeta: SummaryMeta | undefined
  if (workflow === 'auto-summary') {
    const generated = await generateSummaryDraft(
      searchResults,
      engine.ctx,
      signal,
      loadConfigSafe().summaryModel,
    ).catch(() => buildDeterministicSummary(searchResults))
    approvedSummary = generated.summary
    summaryMeta = generated.meta
  }

  const searchId = generateId()
  storeResult(searchId, { id: searchId, type: 'search', timestamp: Date.now(), queries: searchResults })
  let fetchId: string | null = null
  if (allInlineContent.length > 0) {
    fetchId = generateId()
    storeFetchedContentResult(fetchId, { id: fetchId, type: 'fetch', timestamp: Date.now(), urls: stripThumbnails(allInlineContent) })
  } else if (params.includeContent) {
    fetchId = startBackgroundFetch(allUrls)
  }

  let text = buildSearchText({ queryList, results: searchResults, approvedSummary })
  if (fetchId) {
    text += allInlineContent.length > 0
      ? `\n\n---\nFull content for ${allInlineContent.length} sources available [${fetchId}].`
      : `\n\n---\nContent fetching in background [${fetchId}].`
  }
  return {
    text,
    details: {
      searchId,
      fetchId,
      queryCount: queryList.length,
      successfulQueries: searchResults.filter(result => !result.error).length,
      totalResults: searchResults.reduce((sum, result) => sum + result.results.length, 0),
      workflow,
      summary: approvedSummary && summaryMeta ? { text: approvedSummary, ...summaryMeta } : undefined,
    },
  }
}

async function executeCuratedSearch(engine: Engine, params: {
  queryList: string[]
  numResults?: number
  includeContent: boolean
  recencyFilter?: RecencyFilter
  domainFilter?: string[]
  provider?: unknown
}, signal?: AbortSignal): Promise<ToolResult> {
  const collected = new Map<number, QueryResultData>()
  const available = await getProviderAvailability(engine.ctx)
  const requested = resolveRequestedProvider(params.provider)
  const defaultProvider = firstAvailableProvider(available)
  const timeout = curatorTimeoutSeconds()
  const sessionToken = randomUUID()
  const searchAbort = new AbortController()
  const searchSignal = signal ? AbortSignal.any([signal, searchAbort.signal]) : searchAbort.signal

  return await new Promise<ToolResult>((resolve, reject) => {
    let settled = false
    let handle: Awaited<ReturnType<typeof startCuratorServer>> | undefined
    const finish = (result: ToolResult) => {
      if (settled) return
      settled = true
      searchAbort.abort()
      handle?.close()
      resolve(result)
    }

    void startCuratorServer({
      queries: params.queryList,
      sessionToken,
      timeout,
      availableProviders: available,
      defaultProvider,
      searchProvider: Array.isArray(requested) ? 'all' : requested,
      summaryModels: [],
      defaultSummaryModel: loadConfigSafe().summaryModel ?? null,
    }, {
      onSubmit(payload) {
        const selected = payload.selectedQueryIndices.length > 0
          ? payload.selectedQueryIndices.flatMap(index => collected.get(index) ? [collected.get(index)!] : [])
          : [...collected.values()]
        const summary = payload.summary?.trim() || buildDeterministicSummary(selected).summary
        const searchId = generateId()
        storeResult(searchId, { id: searchId, type: 'search', timestamp: Date.now(), queries: selected })
        finish({
          text: summary,
          details: { searchId, curated: true, queryCount: selected.length, workflow: 'summary-review' },
        })
      },
      onCancel(reason) {
        const selected = [...collected.values()]
        if (reason === 'timeout' && selected.length > 0) {
          const summary = buildDeterministicSummary(selected).summary
          const searchId = generateId()
          storeResult(searchId, { id: searchId, type: 'search', timestamp: Date.now(), queries: selected })
          finish({ text: summary, details: { searchId, curated: true, cancelled: reason } })
          return
        }
        finish({ text: `Search curation cancelled (${reason}).`, details: { cancelled: true, cancelReason: reason } })
      },
      onProviderChange() {},
      async onAddSearch(query, provider) {
        const response = await search(query, {
          provider: resolveRequestedProvider(provider ?? requested),
          numResults: params.numResults,
          recencyFilter: params.recencyFilter,
          domainFilter: params.domainFilter,
          signal: searchSignal,
          extensionContext: engine.ctx,
        })
        return toCuratorEntries(response)
      },
      onAddSearchResults(entries) {
        for (const entry of entries) {
          collected.set(entry.queryIndex, {
            query: entry.query,
            answer: entry.answer,
            results: entry.results.map(result => ({ title: result.title, url: result.url, snippet: result.snippet ?? '' })),
            error: entry.error ?? null,
            provider: entry.provider,
          })
        }
      },
      async onSummarize(indices, summarizeSignal) {
        const selected = indices.flatMap(index => collected.get(index) ? [collected.get(index)!] : [])
        return generateSummaryDraft(selected, engine.ctx, summarizeSignal).catch(() => buildDeterministicSummary(selected))
      },
      async onRewriteQuery(query) {
        return query
      },
    }).then(async started => {
      handle = started
      void openInBrowser(started.url).catch(() => undefined)
      for (const [index, query] of params.queryList.entries()) {
        if (settled || searchSignal.aborted) break
        try {
          const response = await search(query, {
            provider: requested,
            numResults: params.numResults,
            recencyFilter: params.recencyFilter,
            domainFilter: params.domainFilter,
            includeContent: params.includeContent,
            signal: searchSignal,
            extensionContext: engine.ctx,
          })
          collected.set(index, {
            query,
            answer: response.answer,
            results: response.results,
            error: null,
            provider: response.provider,
          })
          started.pushResult(index, { ...toCuratorEntries(response)[0], query })
        } catch (error) {
          if (isAbortError(error)) break
          const message = error instanceof Error ? error.message : String(error)
          collected.set(index, { query, answer: '', results: [], error: message })
          started.pushError(index, message)
        }
      }
      started.searchesDone()
    }).catch(error => {
      if (!settled) reject(error)
    })

    signal?.addEventListener('abort', () => finish({ text: 'Search curation cancelled (aborted).', details: { cancelled: true } }), { once: true })
  })
}

function toCuratorEntries(response: { answer: string; results: SearchResult[]; provider?: string; error?: string }): CuratorSearchEntry[] {
  return [{
    answer: response.answer,
    results: response.results.map(result => ({
      title: result.title,
      url: result.url,
      domain: extractDomain(result.url),
      snippet: result.snippet,
    })),
    provider: response.provider ?? 'unknown',
    error: response.error,
  }]
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname } catch { return url }
}

export async function executeFetchContent(engine: Engine, params: Record<string, unknown>, signal?: AbortSignal): Promise<ToolResult> {
  let normalized: ReturnType<typeof normalizeFetchContentParams>
  try {
    normalized = normalizeFetchContentParams(params)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { text: `Error: ${message}`, details: { error: message } }
  }
  const { urlList, options } = normalized
  const mode = options.mode ?? 'readable'
  if (mode === 'answer' && !options.prompt) return { text: 'Error: mode answer requires prompt.', details: { error: 'mode answer requires prompt' } }
  if (urlList.length === 0) return { text: 'Error: No URL provided.', details: { error: 'No URL provided' } }

  const { answerModel: _answerModel, ...extractionOptions } = options
  const fetchOptions = mode === 'answer' ? (() => { const { prompt: _prompt, ...rest } = extractionOptions; return rest })() : extractionOptions
  const fetchResults = await fetchAllContent(urlList, signal, fetchOptions)
  const presented = mode === 'answer'
    ? await Promise.all(fetchResults.map(async result => {
      if (result.error) return result
      try {
        const answer = await answerFromPage({
          question: options.prompt!,
          pageText: result.content,
          sourceUrl: result.url,
          ...(options.answerModel ? { model: options.answerModel } : {}),
        }, engine.ctx, signal)
        return { ...result, content: answer.text }
      } catch (error) {
        return { ...result, error: `Page answer failed: ${error instanceof Error ? error.message : String(error)}` }
      }
    }))
    : fetchResults

  const responseId = generateId()
  storeFetchedContentResult(responseId, { id: responseId, type: 'fetch', timestamp: Date.now(), urls: stripThumbnails(fetchResults) })

  if (urlList.length === 1) {
    const result = presented[0]
    if (result.error) return { text: `Error: ${result.error}`, details: { error: result.error, responseId } }
    const slice = initialContentSlice(result.content, getMaxInlineContentChars())
    let text = slice.text
    if (slice.endOffset < result.content.length) {
      text += `\n\n---\nShowing ${slice.endOffset} of ${result.content.length} chars. Use ${engine.names.getSearchContent}({ responseId: "${responseId}", urlIndex: 0, offset: ${slice.endOffset} }) for the next slice.`
    }
    if (result.frames?.length) text = `${result.frames.length} frame(s) extracted.\n\n${text}`
    else if (result.thumbnail) text = `Image fetched (${result.mimeType ?? 'image'}).\n\n${text}`
    return {
      text,
      details: {
        responseId,
        title: result.title,
        urlCount: 1,
        successful: 1,
        totalChars: result.content.length,
        truncated: slice.endOffset < result.content.length,
        mimeType: result.mimeType,
        status: result.status,
      },
    }
  }

  let output = '## Fetched URLs\n\n'
  for (const result of presented) {
    output += result.error ? `- ${result.url}: Error - ${result.error}\n` : `- ${result.title || result.url} (${result.content.length} chars)\n`
  }
  output += `\n---\nUse ${engine.names.getSearchContent}({ responseId: "${responseId}", urlIndex: 0 }) to retrieve bounded content slices.`
  return {
    text: output,
    details: {
      responseId,
      urlCount: urlList.length,
      successful: presented.filter(result => !result.error).length,
    },
  }
}

export function executeGetSearchContent(engine: Engine, params: {
  responseId: string
  query?: string
  queryIndex?: number
  url?: string
  urlIndex?: number
  offset?: number
  limit?: number
  findText?: unknown
  findMode?: string
}): ToolResult {
  if (params.findText !== undefined && (params.offset !== undefined || params.limit !== undefined)) {
    return { text: 'findText cannot be combined with offset or limit', details: { error: 'Incompatible find options' } }
  }
  if (params.findMode !== undefined && params.findText === undefined) {
    return { text: 'findMode requires findText', details: { error: 'findMode requires findText' } }
  }
  const data = getResult(params.responseId)
  if (!data) return { text: `Error: No stored results for "${params.responseId}"`, details: { error: 'Not found', responseId: params.responseId } }

  if (data.type === 'research') {
    const artifact = getResearchArtifact(params.responseId)
    if (!artifact) return { text: `Error: artifact ${params.responseId} not found`, details: { error: 'Artifact not found' } }
    const serialized = JSON.stringify(artifact, null, 2)
    return sliceText(serialized, params.offset, params.limit, { responseId: artifact.id, type: 'research' })
  }

  if (data.type === 'search' && data.queries) {
    const queryData = selectQuery(data.queries, params)
    if ('text' in queryData) return queryData
    if (queryData.error) return { text: `Error for "${queryData.query}": ${queryData.error}`, details: { error: queryData.error } }
    const full = formatFullResults(queryData)
    if (params.findText !== undefined) return findIn(full, params.findText, params.findMode, { query: queryData.query, resultCount: queryData.results.length })
    return { text: full, details: { query: queryData.query, resultCount: queryData.results.length } }
  }

  if (data.type === 'fetch' && data.urls) {
    const selected = selectUrl(data.urls, params)
    if ('text' in selected) return selected
    const { urlData, selectedUrlIndex } = selected
    if (urlData.error) return { text: `Error for ${urlData.url}: ${urlData.error}`, details: { error: urlData.error, url: urlData.url } }
    if (params.findText !== undefined) {
      const found = findIn(urlData.content, params.findText, params.findMode, { url: urlData.url, title: urlData.title, contentLength: urlData.content.length })
      return { ...found, text: `# ${urlData.title || urlData.url}\n\n${found.text}` }
    }
    const sliced = sliceText(urlData.content, params.offset, params.limit, { url: urlData.url, title: urlData.title })
    if (sliced.details.error) return sliced
    const offset = typeof params.offset === 'number' ? params.offset : 0
    const endOffset = offset + (typeof sliced.details.returnedChars === 'number' ? sliced.details.returnedChars : urlData.content.length)
    let text = `# ${urlData.title || urlData.url}\n\n${sliced.text}`
    if (sliced.details.truncated || offset > 0) {
      text += `\n\n---\nShowing chars ${offset}-${endOffset} of ${urlData.content.length}.`
      if (sliced.details.truncated) {
        text += ` Use ${engine.names.getSearchContent}({ responseId: "${params.responseId}", urlIndex: ${selectedUrlIndex}, offset: ${endOffset} }) for the next slice.`
      }
    }
    return { text, details: sliced.details }
  }

  return { text: 'Invalid stored data format', details: { error: 'Invalid data' } }
}

function selectQuery(queries: QueryResultData[], params: { query?: string; queryIndex?: number }): QueryResultData | ToolResult {
  if (params.query !== undefined) {
    const found = queries.find(item => item.query === params.query)
    if (!found) return { text: `Query "${params.query}" not found. Available: ${queries.map(item => `"${item.query}"`).join(', ')}`, details: { error: 'Query not found' } }
    return found
  }
  if (params.queryIndex !== undefined) {
    const found = queries[params.queryIndex]
    if (!found) return { text: `Index ${params.queryIndex} out of range (0-${queries.length - 1})`, details: { error: 'Index out of range' } }
    return found
  }
  return { text: `Specify query or queryIndex. Available: ${queries.map((item, index) => `${index}: "${item.query}"`).join(', ')}`, details: { error: 'No query specified' } }
}

function selectUrl(urls: ExtractedContent[], params: { url?: string; urlIndex?: number }): { urlData: ExtractedContent; selectedUrlIndex: number } | ToolResult {
  if (params.url !== undefined) {
    const selectedUrlIndex = urls.findIndex(item => item.url === params.url)
    const urlData = urls[selectedUrlIndex]
    if (!urlData) return { text: `URL not found. Available:\n  ${urls.map(item => item.url).join('\n  ')}`, details: { error: 'URL not found' } }
    return { urlData, selectedUrlIndex }
  }
  if (params.urlIndex !== undefined) {
    const urlData = urls[params.urlIndex]
    if (!urlData) return { text: `Index ${params.urlIndex} out of range (0-${urls.length - 1})`, details: { error: 'Index out of range' } }
    return { urlData, selectedUrlIndex: params.urlIndex }
  }
  return { text: `Specify url or urlIndex. Available:\n  ${urls.map((item, index) => `${index}: ${item.url}`).join('\n  ')}`, details: { error: 'No URL specified' } }
}

function sliceText(content: string, offsetValue: number | undefined, limitValue: number | undefined, extra: Record<string, unknown>): ToolResult {
  const max = getMaxInlineContentChars()
  const offset = offsetValue ?? 0
  const limit = limitValue ?? max
  if (!Number.isInteger(offset) || offset < 0) return { text: 'offset must be a non-negative integer', details: { error: 'Invalid offset', offset } }
  if (!Number.isInteger(limit) || limit <= 0 || limit > max) return { text: `limit must be an integer from 1 to ${max}`, details: { error: 'Invalid limit', limit, maxLimit: max } }
  if (offset > content.length) return { text: `offset ${offset} is out of range (0-${content.length})`, details: { error: 'Offset out of range', offset, contentLength: content.length } }
  const endOffset = Math.min(offset + limit, content.length)
  const text = content.slice(offset, endOffset)
  return {
    text,
    details: {
      ...extra,
      contentLength: content.length,
      offset,
      limit,
      returnedChars: text.length,
      nextOffset: endOffset < content.length ? endOffset : null,
      truncated: endOffset < content.length,
    },
  }
}

function findIn(content: string, findText: unknown, findMode: string | undefined, extra: Record<string, unknown>): ToolResult {
  try {
    const queries = Array.isArray(findText)
      ? findText.filter((item): item is string => typeof item === 'string')
      : typeof findText === 'string' ? findText : ''
    const found = findContent(content, normalizeFindQueries(queries), (findMode ?? 'case-insensitive') as FindMode)
    const { text, ...findDetails } = found
    return { text, details: { ...extra, findMode: findMode ?? 'case-insensitive', ...findDetails } }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { text: message, details: { error: message } }
  }
}

export async function executeSourceCheck(engine: Engine, params: {
  claim: string
  queries?: string[]
  numResults?: number
  fetchContent?: boolean
  recencyFilter?: string
  domainFilter?: string[]
  provider?: unknown
}, signal?: AbortSignal): Promise<ToolResult> {
  const claim = params.claim.trim()
  if (!claim) return { text: "Error: 'claim' is required.", details: { error: 'Missing claim' } }
  const queries = (params.queries?.map(item => item.trim()).filter(Boolean) ?? [claim]).slice(0, 8)
  const numResults = typeof params.numResults === 'number' && Number.isFinite(params.numResults)
    ? Math.min(20, Math.max(1, Math.floor(params.numResults)))
    : 5
  const recencyFilter = normalizeRecencyFilter(params.recencyFilter)
  const resultsByUrl = new Map<string, SearchResult>()
  const summaries: string[] = []
  const errors: Array<{ query: string; error: string }> = []
  let provider: string | undefined

  for (const query of queries) {
    if (signal?.aborted) break
    try {
      const response = await search(query, {
        provider: resolveRequestedProvider(params.provider),
        numResults,
        recencyFilter,
        domainFilter: params.domainFilter,
        signal,
        extensionContext: engine.ctx,
      })
      provider ??= response.provider
      if (response.answer) summaries.push(`${query}: ${response.answer}`)
      for (const result of response.results) {
        if (!resultsByUrl.has(result.url)) resultsByUrl.set(result.url, result)
      }
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) break
      errors.push({ query, error: error instanceof Error ? error.message : String(error) })
    }
  }

  const results = [...resultsByUrl.values()].slice(0, 20).map((result, index) => ({ ...result, rank: index + 1 }))
  let fetched: ExtractedContent[] = []
  if (params.fetchContent && results.length > 0) {
    const urls = results.slice(0, 5).map(result => result.url)
    try {
      fetched = await fetchAllContent(urls, signal)
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) throw error
      fetched = urls.map(url => ({ url, title: '', content: '', error: error instanceof Error ? error.message : String(error) }))
    }
  }
  const artifact = withClaimAssessment(buildResearchArtifact({
    query: claim,
    provider,
    summary: summaries.length > 0 ? summaries.join('\n\n') : undefined,
    results,
    fetched,
    recency: recencyFilter,
    domainFilter: params.domainFilter,
  }), [claim])
  if (errors.length > 0) artifact.errors = errors
  storeResearchArtifact(artifact)
  storeResult(artifact.id, { id: artifact.id, type: 'research', timestamp: artifact.timestamp, artifact })
  const storedNames = joinToolNames([engine.names.webSearch, engine.names.sourceCheck, engine.names.fetchContent])
  return {
    text: formatSourceCheckResult(artifact, engine.names.getSearchContent),
    details: { responseId: artifact.id, artifact, sourceCount: artifact.sources.length, passageCount: artifact.passages.length, storedNames },
  }
}

export async function getProviderAvailability(ctx: ExtensionContext) {
  return {
    all: true,
    openai: await isOpenAISearchAvailable(ctx),
    brave: isBraveAvailable(),
    parallel: isParallelAvailable(),
    tinyfish: isTinyFishAvailable(),
    search1api: isSearch1APIAvailable(),
    searchinfinity: isSearchinfinityAvailable(),
    querit: isQueritAvailable(),
    tavily: isTavilyAvailable(),
    firecrawl: isFirecrawlAvailable(),
    jina: isJinaSearchAvailable(),
    serpdive: isSerpdiveAvailable(),
    kagi: isKagiAvailable(),
    bocha: isBochaAvailable(),
    ollama: isOllamaAvailable(),
    searxng: isSearXNGAvailable(),
    duckduckgo: isDuckDuckGoAvailable(),
    perplexity: isPerplexityAvailable(),
    exa: isExaAvailable(),
    gemini: isGeminiApiAvailable() || Boolean(await isGeminiWebAvailable()),
    anysearch: isAnySearchAvailable(),
    xai: await isXaiSearchAvailable(ctx),
    brightdata: isBrightDataAvailable(),
    serpbase: isSerpBaseAvailable(),
  }
}

function firstAvailableProvider(available: Awaited<ReturnType<typeof getProviderAvailability>>): string {
  const order = ['searxng', 'openai', 'exa', 'brave', 'parallel', 'tinyfish', 'search1api', 'tavily', 'jina', 'perplexity', 'gemini'] as const
  for (const id of order) {
    if (available[id]) return id
  }
  return 'exa'
}

function curatorTimeoutSeconds(): number {
  const value = loadConfigSafe().curatorTimeoutSeconds
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = Math.floor(value)
    if (normalized >= 1) return Math.min(normalized, MAX_CURATOR_TIMEOUT_SECONDS)
  }
  return resolveCuratorNetworkConfig().enabled ? DEFAULT_REMOTE_CURATOR_TIMEOUT_SECONDS : DEFAULT_CURATOR_TIMEOUT_SECONDS
}

export async function openInBrowser(url: string): Promise<void> {
  const command = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'cmd' : 'xdg-open'
  const args = platform() === 'win32' ? ['/c', 'start', '', url] : [url]
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.unref()
    child.on('error', reject)
    child.on('spawn', () => resolve())
  })
}

export function formatStoredResults(): string {
  const results = getAllResults()
  if (results.length === 0) return 'No stored search/fetch results in this process.'
  return results.map(item => formatStored(item)).join('\n')
}

function formatStored(item: StoredSearchData): string {
  if (item.type === 'search') return `- ${item.id} search (${item.queries?.length ?? 0} queries)`
  if (item.type === 'fetch') return `- ${item.id} fetch (${item.urls?.length ?? item.urlMetadata?.length ?? 0} urls)`
  return `- ${item.id} ${item.type}`
}

export async function formatStatus(engine: Engine): Promise<string> {
  const available = await getProviderAvailability(engine.ctx)
  const enabled = Object.entries(available).filter(([, value]) => value).map(([key]) => key)
  const cookies = await isGeminiWebAvailable().catch(() => null)
  const email = cookies ? await getActiveGoogleEmail(cookies).catch(() => null) : null
  return [
    `dsh-web-access tools: ${engine.names.webSearch}, ${engine.names.fetchContent}, ${engine.names.getSearchContent}, ${engine.names.sourceCheck}`,
    `default workflow: ${engine.defaultWorkflow}`,
    `available providers: ${enabled.join(', ') || '(none)'}`,
    email ? `google account: ${email}` : 'google account: not detected',
  ].join('\n')
}

export type { SearchProviderSelection }
