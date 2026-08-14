import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-web'
import type { Engine } from './engine.ts'
import { fetchAllContent } from './engine.ts'
import { search } from './gemini-search.ts'

const PROVIDER_ID = 'web-access'

export function registerWebProviders(ctx: Context, engine: Engine): void {
  const web = ctx.get('web')
  if (!web) return

  try {
    web.registerSearchProvider({
      id: PROVIDER_ID,
      available() {
        return true
      },
      async search(request, signal) {
        const response = await search(request.query, {
          numResults: request.maxResults,
          signal,
          extensionContext: engine.ctx,
        })
        return {
          content: response.answer || undefined,
          sources: response.results.map(result => ({
            url: result.url,
            title: result.title || undefined,
            snippet: result.snippet || undefined,
          })),
          truncated: false,
        }
      },
    })
  } catch (error) {
    console.warn(`[dsh-web-access] skipped search provider: ${error instanceof Error ? error.message : String(error)}`)
  }

  try {
    web.registerFetchProvider({
      id: PROVIDER_ID,
      available() {
        return true
      },
      async fetch(request, signal) {
        const [result] = await fetchAllContent([request.url], signal)
        if (!result) throw new Error(`fetch returned no result for ${request.url}`)
        if (result.error) throw new Error(result.error)
        return {
          url: result.url,
          statusCode: result.status ?? 200,
          body: { kind: 'text' as const, content: result.content },
          truncated: false,
        }
      },
    })
  } catch (error) {
    console.warn(`[dsh-web-access] skipped fetch provider: ${error instanceof Error ? error.message : String(error)}`)
  }
}
