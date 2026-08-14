import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { getWebSearchConfigDir, getWebSearchConfigPath } from './utils.ts'
import { normalizeSearchProviderSelection, type SearchProviderSelection } from './gemini-search.ts'

export type ToolNameKey = 'webSearch' | 'sourceCheck' | 'fetchContent' | 'getSearchContent'
export type CommandName = 'websearch' | 'curator' | 'search' | 'google-account'
export type WebSearchWorkflow = 'none' | 'summary-review' | 'auto-summary'

export interface ToolNames {
  webSearch: string
  sourceCheck: string
  fetchContent: string
  getSearchContent: string
}

export interface WebSearchConfig {
  provider?: unknown
  searchProvider?: unknown
  workflow?: string
  curatorTimeoutSeconds?: unknown
  autoOpenBrowser?: unknown
  curatorRemote?: unknown
  summaryModel?: string
  summaryGenerationDeadlineMs?: unknown
  maxInlineContentChars?: unknown
  webSearch?: { enabled?: boolean }
  tools?: Partial<Record<ToolNameKey, { enabled?: boolean }>>
  commands?: Partial<Record<CommandName, { enabled?: boolean }>>
  toolNames?: Partial<ToolNames>
}

export const DEFAULT_TOOL_NAMES: ToolNames = {
  webSearch: 'web_search',
  sourceCheck: 'source_check',
  fetchContent: 'fetch_content',
  getSearchContent: 'get_search_content',
}

const TOOL_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/
export const DEFAULT_MAX_INLINE_CONTENT_CHARS = 30_000
export const MAX_INLINE_CONTENT_CHARS = 200_000
export const DEFAULT_CURATOR_TIMEOUT_SECONDS = 20
export const DEFAULT_REMOTE_CURATOR_TIMEOUT_SECONDS = 60
export const MAX_CURATOR_TIMEOUT_SECONDS = 600
export const MAX_SUMMARY_GENERATION_DEADLINE_MS = 600_000
export const SUMMARY_GENERATION_DEADLINE_MS = 30_000

let cached: WebSearchConfig | null = null

export function resetConfigCache(): void {
  cached = null
}

export function loadConfig(): WebSearchConfig {
  if (cached) return cached
  const path = getWebSearchConfigPath()
  if (!existsSync(path)) {
    cached = {}
    return cached
  }
  const raw = readFileSync(path, 'utf8')
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`Invalid config in ${path}: expected a JSON object`)
    }
    cached = parsed as WebSearchConfig
    return cached
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse ${path}: ${message}`)
  }
}

export function loadConfigSafe(): WebSearchConfig {
  try {
    return loadConfig()
  } catch (error) {
    console.error(`[dsh-web-access] ${error instanceof Error ? error.message : String(error)}`)
    return {}
  }
}

export function saveConfig(updates: Partial<WebSearchConfig>): void {
  const config = loadConfigSafe()
  Object.assign(config, updates)
  cached = config
  const dir = getWebSearchConfigDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(getWebSearchConfigPath(), `${JSON.stringify(config, null, 2)}\n`)
}

export function isToolEnabled(config: WebSearchConfig, key: ToolNameKey): boolean {
  const override = config.tools?.[key]?.enabled
  if (typeof override === 'boolean') return override
  return key !== 'webSearch' && key !== 'sourceCheck' || config.webSearch?.enabled !== false
}

export function isCommandEnabled(config: WebSearchConfig, name: CommandName): boolean {
  return config.commands?.[name]?.enabled !== false
}

export function resolveToolNames(config: WebSearchConfig): ToolNames {
  if (config.toolNames !== undefined && (!config.toolNames || typeof config.toolNames !== 'object' || Array.isArray(config.toolNames))) {
    throw new Error(`toolNames in ${getWebSearchConfigPath()} must be an object`)
  }
  const names = { ...DEFAULT_TOOL_NAMES }
  for (const key of Object.keys(DEFAULT_TOOL_NAMES) as ToolNameKey[]) {
    const value = config.toolNames?.[key]
    if (value === undefined) continue
    if (typeof value !== 'string') throw new Error(`toolNames.${key} must be a string`)
    const trimmed = value.trim()
    if (!TOOL_NAME_PATTERN.test(trimmed)) {
      throw new Error(`toolNames.${key} must start with a letter and contain only letters, numbers, underscores, or hyphens`)
    }
    names[key] = trimmed
  }
  return names
}

export function resolveRequestedProvider(requested: unknown): SearchProviderSelection {
  if (requested !== undefined && requested !== null && requested !== 'auto') {
    return normalizeSearchProviderSelection(requested, 'provider')
  }
  const config = loadConfigSafe()
  const configured = config.searchProvider ?? config.provider
  if (configured === undefined) return 'auto'
  return normalizeSearchProviderSelection(configured, `provider in ${getWebSearchConfigPath()}`)
}

export function resolveWorkflow(input: unknown, defaultWorkflow: WebSearchWorkflow): WebSearchWorkflow {
  const normalized = typeof input === 'string' ? input.trim().toLowerCase() : ''
  if (normalized === 'none' || normalized === 'summary-review' || normalized === 'auto-summary') return normalized
  return defaultWorkflow
}

export function normalizeQueryList(queryList: unknown[]): string[] {
  const normalized: string[] = []
  for (const query of queryList) {
    if (typeof query !== 'string') continue
    const trimmed = query.trim()
    if (trimmed.length > 0) normalized.push(trimmed)
  }
  return normalized
}

export function getSummaryGenerationDeadlineMs(): number {
  const value = loadConfigSafe().summaryGenerationDeadlineMs
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    return SUMMARY_GENERATION_DEADLINE_MS
  }
  return Math.min(value, MAX_SUMMARY_GENERATION_DEADLINE_MS)
}

export function getMaxInlineContentChars(): number {
  const value = loadConfigSafe().maxInlineContentChars
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    return DEFAULT_MAX_INLINE_CONTENT_CHARS
  }
  return Math.min(value, MAX_INLINE_CONTENT_CHARS)
}

export function joinToolNames(names: string[]): string {
  if (names.length === 0) return 'stored content'
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} or ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, or ${names[names.length - 1]}`
}
