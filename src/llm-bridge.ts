import type { Context } from '@deepseek-ai/cordis'
import { BlockAssembler, type GenerateOptions } from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm/message'
import { loadConfigSafe } from './config.ts'
import type { Engine } from './engine.ts'
import {
  setCompleteImplementation,
  type CompleteResponse,
  type ExtensionContext,
  type Model,
  type ModelRegistry,
} from './host.ts'

interface LlmService {
  listProviders(): Array<{ id: string }>
  listModels(provider: string): Promise<Array<{ id: string; context?: number }>>
  stream(options: GenerateOptions): AsyncIterable<{ type: string; text?: string; [key: string]: unknown }>
}

export async function bindHarnessLlm(ctx: Context, engine: Engine): Promise<void> {
  const llm = ctx.get('llm') as LlmService | undefined
  if (!llm) return

  const models = await collectLlmModels(llm)
  if (models.length === 0) return

  const registry: ModelRegistry = {
    getAll: () => models,
    getAvailable: () => models,
    find: (provider, id) => models.find(model => model.provider === provider && model.id === id),
    async getApiKeyAndHeaders() {
      return { ok: true, apiKey: 'dsh-llm' }
    },
  }
  const preferred = pickPreferredModel(models)
  engine.ctx = {
    ...engine.ctx,
    model: preferred,
    modelRegistry: registry,
    hasUI: true,
  } satisfies ExtensionContext

  setCompleteImplementation(async (model, params, options = {}) => completeWithLlm(llm, model, params, options))
}

async function collectLlmModels(llm: LlmService): Promise<Model[]> {
  const models: Model[] = []
  for (const provider of llm.listProviders()) {
    const listed = await llm.listModels(provider.id).catch(() => [])
    for (const item of listed) {
      models.push({
        provider: provider.id,
        id: item.id,
        input: ['text'],
        contextWindow: item.context && item.context > 0 ? item.context : 128_000,
      })
    }
  }
  return models
}

function pickPreferredModel(models: Model[]): Model {
  const configured = typeof loadConfigSafe().summaryModel === 'string' ? loadConfigSafe().summaryModel!.trim() : ''
  if (configured.includes('/')) {
    const slash = configured.indexOf('/')
    const match = models.find(model => model.provider === configured.slice(0, slash) && model.id === configured.slice(slash + 1))
    if (match) return match
  }
  return models[0]
}

async function completeWithLlm(
  llm: LlmService,
  model: Model,
  params: { systemPrompt?: string; messages: Array<{ content: Array<{ text?: string }> }> },
  options: { signal?: AbortSignal; maxTokens?: number },
): Promise<CompleteResponse> {
  if (options.signal?.aborted) return { content: [], stopReason: 'aborted' }
  const prompt = params.messages.map(message => message.content.map(part => part.text ?? '').join('\n')).join('\n\n')
  const assembler = new BlockAssembler()
  try {
    for await (const chunk of llm.stream({
      provider: model.provider,
      model: model.id,
      system: params.systemPrompt,
      messages: [createUserMessage({
        content: [{ type: 'text', text: prompt }],
        source: { kind: 'plugin', plugin: 'dsh-web-access', form: 'notice', summary: 'web access summary prompt' },
      })],
      maxTokens: options.maxTokens,
      signal: options.signal,
    })) {
      assembler.push(chunk as never)
    }
    const text = assembler.blocks()
      .map(block => block.type === 'text' ? block.text : '')
      .join('\n')
      .trim()
    return { content: text ? [{ type: 'text', text }] : [], stopReason: 'end' }
  } catch (error) {
    if (options.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      return { content: [], stopReason: 'aborted' }
    }
    return { content: [], stopReason: 'error', errorMessage: error instanceof Error ? error.message : String(error) }
  }
}
