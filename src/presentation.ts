import type { ToolResult, WebFetchResultView, WebSearchResultView } from '@deepseek-ai/dsh-tools'

export interface WebSourceMeta {
  url: string
  title?: string
  snippet?: string
  publishedAt?: string
}

export function searchMetaFromDetails(details: Record<string, unknown>): Record<string, unknown> | undefined {
  const sources = Array.isArray(details.sources) ? details.sources.filter(isSource) : []
  if (sources.length === 0 && typeof details.answer !== 'string' && !details.error) return undefined
  return {
    sources,
    truncated: details.truncated === true,
    ...typeof details.answer === 'string' ? { answer: details.answer } : {},
  }
}

export function fetchMetaFromDetails(details: Record<string, unknown>): Record<string, unknown> | undefined {
  const url = typeof details.url === 'string' ? details.url : typeof details.responseId === 'string' ? details.responseId : undefined
  if (!url && typeof details.statusCode !== 'number' && typeof details.status !== 'number') return undefined
  return {
    url: typeof details.url === 'string' ? details.url : '',
    statusCode: typeof details.statusCode === 'number' ? details.statusCode : typeof details.status === 'number' ? details.status : 200,
    truncated: details.truncated === true,
  }
}

export function presentSearchResult(args: { query?: string; queries?: string[] }, result: ToolResult): WebSearchResultView | undefined {
  if (result.isError) return undefined
  const meta = asRecord(result.meta)
  if (!meta || !Array.isArray(meta.sources) || !meta.sources.every(isSource) || typeof meta.truncated !== 'boolean') return undefined
  const title = args.query ?? (Array.isArray(args.queries) ? `${args.queries.length} queries` : 'search')
  return {
    card: 'web',
    kind: 'search',
    title,
    sources: meta.sources,
    truncated: meta.truncated,
    ...typeof meta.answer === 'string' ? { answer: meta.answer } : {},
  }
}

export function presentFetchResult(args: { url?: string }, result: ToolResult): WebFetchResultView | undefined {
  if (result.isError) return undefined
  const meta = asRecord(result.meta)
  if (!meta || typeof meta.url !== 'string' || typeof meta.statusCode !== 'number' || typeof meta.truncated !== 'boolean') return undefined
  return {
    card: 'web',
    kind: 'fetch',
    title: args.url ?? meta.url,
    url: meta.url,
    statusCode: meta.statusCode,
    truncated: meta.truncated,
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function isSource(value: unknown): value is WebSourceMeta {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.url === 'string'
    && (record.title === undefined || typeof record.title === 'string')
    && (record.snippet === undefined || typeof record.snippet === 'string')
    && (record.publishedAt === undefined || typeof record.publishedAt === 'string')
}
