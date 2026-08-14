import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-tools'
import { isCommandEnabled, isToolEnabled, loadConfigSafe } from './config.ts'
import { registerCommands } from './commands.ts'
import {
  createEngine,
  disposeEngine,
  executeFetchContent,
  executeGetSearchContent,
  executeSourceCheck,
  executeWebSearch,
} from './engine.ts'
import { createHostContext } from './host.ts'
import { registerWebProviders } from './web-providers.ts'

export const name = 'dsh-web-access'
export const inject = ['tools']

export interface Config {
  replaceOfficialSearch?: boolean
  registerProviders?: boolean
}

export const Config: Schema<Config> = Schema.object({
  replaceOfficialSearch: Schema.boolean(),
  registerProviders: Schema.boolean(),
})

export function apply(ctx: Context, config: Config = {}): void {
  const fileConfig = loadConfigSafe()
  const engine = createEngine(createHostContext())

  ctx.effect(() => () => disposeEngine(), 'dsh-web-access.runtime')

  if (isToolEnabled(fileConfig, 'webSearch')) {
    const official = ctx.tools.get(engine.names.webSearch)
    const searchName = official && !config.replaceOfficialSearch
      ? (engine.names.webSearch === 'web_search' ? 'web_access_search' : engine.names.webSearch)
      : engine.names.webSearch
    ctx.tools.register(defineTool({
      name: searchName,
      description: [
        'Search the web via OpenAI, Brave, Parallel, TinyFish, Search1API, Searchinfinity, Querit, Tavily, Firecrawl, Jina, SERPdive, Kagi, Bocha, Ollama, SearXNG, DuckDuckGo, Exa, Perplexity, Gemini, AnySearch, xAI, Bright Data, or SerpBase.',
        'Prefer queries (plural) with 2-4 varied angles over a single query.',
        'Set workflow to none for raw results, auto-summary for a synthesized summary, or summary-review to open the curator.',
      ].join(' '),
      parameters: {
        query: { type: 'string', description: 'Single search query. For research, prefer queries.' },
        queries: { type: 'array', items: { type: 'string' }, description: 'Multiple queries searched in sequence.' },
        numResults: { type: 'number', description: 'Results per query (default 5, max 20).' },
        includeContent: { type: 'boolean', description: 'Fetch full page content in the background.' },
        recencyFilter: { type: 'string', enum: ['day', 'week', 'month', 'year'], description: 'Filter by recency.' },
        domainFilter: { type: 'array', items: { type: 'string' }, description: 'Limit to domains; prefix with - to exclude.' },
        provider: { type: 'json', description: 'Provider name, array of names, auto, or all.' },
        workflow: { type: 'string', enum: ['none', 'summary-review', 'auto-summary'], description: 'Search workflow mode.' },
      },
      output: jsonTextOutput,
      presentCall(args) {
        const label = args.query ?? (Array.isArray(args.queries) ? `${args.queries.length} queries` : 'search')
        return { card: 'generic', title: `${searchName} ${String(label).slice(0, 60)}`, kind: 'search' }
      },
      async execute(args, exec) {
        return asJson(await executeWebSearch(engine, args, exec.signal))
      },
    }))
  }

  if (isToolEnabled(fileConfig, 'fetchContent')) {
    ctx.tools.register(defineTool({
      name: engine.names.fetchContent,
      description: 'Fetch URL(s) as readable markdown, raw HTTP bodies, GitHub clones, PDFs, YouTube/local video, or page-grounded answers.',
      parameters: {
        url: { type: 'string', description: 'Single URL or local video path.' },
        urls: { type: 'array', items: { type: 'string' }, description: 'Multiple URLs to fetch in parallel.' },
        forceClone: { type: 'boolean', description: 'Force cloning large GitHub repositories.' },
        prompt: { type: 'string', description: 'Question for video analysis or mode answer.' },
        mode: { type: 'string', enum: ['readable', 'raw', 'answer'], description: 'Fetch mode.' },
        answerModel: { type: 'string', description: 'provider/model-id override for mode answer.' },
        timestamp: { type: 'string', description: 'Video timestamp or range, e.g. 23:41 or 23:41-25:00.' },
        frames: { type: 'integer', description: 'Number of video frames to extract (1-12).' },
        model: { type: 'string', description: 'Gemini model override for video/YouTube analysis.' },
      },
      output: jsonTextOutput,
      presentCall(args) {
        return { card: 'generic', title: `fetch ${args.url ?? 'urls'}`, kind: 'read' }
      },
      async execute(args, exec) {
        return asJson(await executeFetchContent(engine, args, exec.signal))
      },
    }))
  }

  if (isToolEnabled(fileConfig, 'getSearchContent')) {
    ctx.tools.register(defineTool({
      name: engine.names.getSearchContent,
      description: `Retrieve stored content from a previous ${engine.names.webSearch}, ${engine.names.fetchContent}, or ${engine.names.sourceCheck} call.`,
      parameters: {
        responseId: { type: 'string', required: true, description: 'responseId from a previous search or fetch.' },
        query: { type: 'string', description: 'Stored search query to retrieve.' },
        queryIndex: { type: 'number', description: 'Stored search query index.' },
        url: { type: 'string', description: 'Stored fetch URL to retrieve.' },
        urlIndex: { type: 'number', description: 'Stored fetch URL index.' },
        offset: { type: 'number', description: 'Character offset. Cannot combine with findText.' },
        limit: { type: 'number', description: 'Maximum characters to return.' },
        findText: { type: 'json', description: 'Text or texts to find. Cannot combine with offset/limit.' },
        findMode: { type: 'string', enum: ['exact', 'case-insensitive', 'fuzzy'], description: 'Matching mode for findText.' },
      },
      output: jsonTextOutput,
      presentCall(args) {
        return { card: 'generic', title: `get ${args.responseId}`, kind: 'read' }
      },
      async execute(args) {
        return asJson(executeGetSearchContent(engine, args))
      },
    }))
  }

  if (isToolEnabled(fileConfig, 'sourceCheck')) {
    ctx.tools.register(defineTool({
      name: engine.names.sourceCheck,
      description: 'Check a claim against web sources and return a research artifact with passage citations.',
      parameters: {
        claim: { type: 'string', required: true, description: 'The assertion to check.' },
        queries: { type: 'array', items: { type: 'string' }, description: 'Search queries (default: the claim).' },
        numResults: { type: 'number', description: 'Results per query (default 5, max 20).' },
        fetchContent: { type: 'boolean', description: 'Fetch up to 5 result pages for exact passages.' },
        recencyFilter: { type: 'string', enum: ['day', 'week', 'month', 'year'], description: 'Filter by recency.' },
        domainFilter: { type: 'array', items: { type: 'string' }, description: 'Limit to domains; prefix with - to exclude.' },
        provider: { type: 'json', description: 'Search provider, array of providers, auto, or all.' },
      },
      output: jsonTextOutput,
      presentCall(args) {
        return { card: 'generic', title: `source_check ${args.claim.slice(0, 48)}`, kind: 'search' }
      },
      async execute(args, exec) {
        return asJson(await executeSourceCheck(engine, args, exec.signal))
      },
    }))
  }

  if (config.registerProviders !== false) {
    registerWebProviders(ctx, engine)
  }

  if (isCommandEnabled(fileConfig, 'websearch') || isCommandEnabled(fileConfig, 'curator') || isCommandEnabled(fileConfig, 'search') || isCommandEnabled(fileConfig, 'google-account')) {
    registerCommands(ctx, engine)
  }
}

const jsonTextOutput = {
  schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      text: { type: 'string' as const, required: true as const },
      details: { type: 'json' as const, required: true as const },
    },
  },
  render(_args: unknown, value: { text: string }) {
    return [{ type: 'text' as const, text: value.text }]
  },
}

function asJson(result: { text: string; details: Record<string, unknown> }) {
  return JSON.parse(JSON.stringify({ text: result.text, details: result.details })) as { text: string; details: import('@deepseek-ai/dsh-session').JsonValue }
}
