/**
 * Host shims that replace Pi coding-agent / pi-ai imports.
 * Search, fetch, and extraction stay host-independent; this file only
 * supplies the small model/session/image surface those modules touch.
 */

export type Api = string

export interface Model<A = Api> {
	provider: string
	id: string
	input: string[]
	contextWindow: number
	api?: A
}

export interface TextContent {
	type: 'text'
	text: string
}

export interface ImageContent {
	type: 'image'
	data: Uint8Array | string
	mimeType: string
}

export interface Message {
	role: 'user' | 'assistant' | 'system'
	content: Array<{ type: string; text?: string; refusal?: string }>
	timestamp: number
}

export interface CompleteResponse {
	content: Array<{ type: string; text?: string; refusal?: string }>
	stopReason: 'end' | 'aborted' | 'error'
	errorMessage?: string
}

export interface ModelRegistry {
	getAll(): Model[]
	getAvailable(): Model[]
	find(provider: string, id: string): Model | undefined
	getApiKeyAndHeaders(model: Model): Promise<{
		ok: boolean
		apiKey?: string
		headers?: Record<string, string | null>
	}>
}

export interface ExtensionContext {
	model?: Model
	modelRegistry: ModelRegistry
	cwd: string
	isProjectTrusted: () => boolean
	sessionManager: { getBranch(): Array<{ type: string; customType?: string; data?: unknown }> }
	hasUI?: boolean
}

export async function resizeImage(
	data: Uint8Array,
	mimeType: string,
	_opts?: { maxWidth?: number; maxHeight?: number },
): Promise<{ data: string; mimeType: string; width: number; height: number } | null> {
	const size = peekImageSize(data, mimeType)
	return {
		data: Buffer.from(data).toString('base64'),
		mimeType,
		width: size?.width ?? 0,
		height: size?.height ?? 0,
	}
}

export async function complete(
	model: Model,
	params: { systemPrompt?: string; messages: Message[] },
	options: { apiKey?: string; headers?: Record<string, string | null>; signal?: AbortSignal; maxTokens?: number } = {},
): Promise<CompleteResponse> {
	if (options.signal?.aborted) return { content: [], stopReason: 'aborted' }
	const provider = model.provider.toLowerCase()
	if (provider === 'google' || provider === 'gemini') {
		return completeWithGemini(model, params, options)
	}
	throw new Error(`No completion backend for ${model.provider}/${model.id} in dsh-web-access`)
}

export function createHostContext(overrides: Partial<ExtensionContext> = {}): ExtensionContext {
	const models = listLocalModels()
	const registry: ModelRegistry = {
		getAll: () => models,
		getAvailable: () => models,
		find: (provider, id) => models.find(model => model.provider === provider && model.id === id),
		async getApiKeyAndHeaders(model) {
			if (model.provider === 'google' || model.provider === 'gemini') {
				const apiKey = process.env.GEMINI_API_KEY?.trim()
				return apiKey ? { ok: true, apiKey } : { ok: false }
			}
			if (model.provider === 'openai' || model.provider === 'openai-codex') {
				const apiKey = process.env.OPENAI_API_KEY?.trim()
				return apiKey ? { ok: true, apiKey } : { ok: false }
			}
			return { ok: false }
		},
	}
	return {
		model: models[0],
		modelRegistry: registry,
		cwd: process.cwd(),
		isProjectTrusted: () => true,
		sessionManager: { getBranch: () => [] },
		hasUI: false,
		...overrides,
	}
}

function listLocalModels(): Model[] {
	const models: Model[] = []
	if (process.env.GEMINI_API_KEY?.trim()) {
		models.push({
			provider: 'google',
			id: process.env.DSH_WEB_ACCESS_SUMMARY_MODEL?.trim() || 'gemini-3.6-flash',
			input: ['text'],
			contextWindow: 1_000_000,
		})
	}
	if (process.env.OPENAI_API_KEY?.trim()) {
		models.push({
			provider: 'openai',
			id: 'gpt-4.1-mini',
			input: ['text'],
			contextWindow: 128_000,
		})
	}
	return models
}

async function completeWithGemini(
	model: Model,
	params: { systemPrompt?: string; messages: Message[] },
	options: { apiKey?: string; headers?: Record<string, string | null>; signal?: AbortSignal; maxTokens?: number },
): Promise<CompleteResponse> {
	const { fetchGeminiApi, getVersionedApiBase } = await import('./gemini-api.ts')
	const prompt = [
		params.systemPrompt ? `System:\n${params.systemPrompt}` : '',
		...params.messages.map(message => message.content.map(part => part.text ?? '').join('\n')),
	].filter(Boolean).join('\n\n')
	const url = `${getVersionedApiBase()}/models/${model.id}:generateContent`
	try {
		const response = await fetchGeminiApi(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contents: [{ role: 'user', parts: [{ text: prompt }] }],
				generationConfig: options.maxTokens ? { maxOutputTokens: options.maxTokens } : undefined,
			}),
			signal: options.signal,
		}, options.apiKey)
		if (!response.ok) {
			const text = await response.text()
			return { content: [], stopReason: 'error', errorMessage: `Gemini ${response.status}: ${text.slice(0, 300)}` }
		}
		const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
		const text = data.candidates?.[0]?.content?.parts?.map(part => part.text ?? '').join('\n').trim() ?? ''
		return { content: text ? [{ type: 'text', text }] : [], stopReason: 'end' }
	} catch (error) {
		if (options.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
			return { content: [], stopReason: 'aborted' }
		}
		return { content: [], stopReason: 'error', errorMessage: error instanceof Error ? error.message : String(error) }
	}
}

function peekImageSize(data: Uint8Array, mimeType: string): { width: number; height: number } | null {
	if (mimeType === 'image/png' && data.length >= 24 && data[0] === 0x89 && data[1] === 0x50) {
		const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
		return { width: view.getUint32(16), height: view.getUint32(20) }
	}
	if ((mimeType === 'image/jpeg' || mimeType === 'image/jpg') && data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
		let offset = 2
		while (offset + 9 < data.length) {
			if (data[offset] !== 0xff) break
			const marker = data[offset + 1]
			const size = (data[offset + 2] << 8) | data[offset + 3]
			if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
				return { height: (data[offset + 5] << 8) | data[offset + 6], width: (data[offset + 7] << 8) | data[offset + 8] }
			}
			offset += 2 + size
		}
	}
	return null
}
