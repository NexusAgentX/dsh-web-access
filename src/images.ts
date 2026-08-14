import type { ExtractedContent } from './extract.ts'

const ACCEPTED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

export interface ImageSaver {
  saveImage(input: { data: Uint8Array; mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; name?: string }): Promise<unknown>
}

export async function attachmentsFromExtracted(result: ExtractedContent, saver?: ImageSaver): Promise<unknown[]> {
  if (!saver) return []
  const saved: unknown[] = []
  const frames = result.frames ?? []
  const images = frames.length > 0
    ? frames.map((frame, index) => ({ data: frame.data, mimeType: frame.mimeType, name: `frame-${index}` }))
    : result.thumbnail
      ? [{ data: result.thumbnail.data, mimeType: result.thumbnail.mimeType, name: result.title || 'image' }]
      : []
  for (const image of images) {
    const mediaType = normalizeMediaType(image.mimeType)
    if (!mediaType) continue
    const bytes = toBytes(image.data)
    if (!bytes) continue
    try {
      saved.push(await saver.saveImage({ data: bytes, mediaType, name: image.name }))
    } catch {
      // Keep fetch successful even if the attachment seam rejects the raster.
    }
  }
  return saved
}

function normalizeMediaType(value: string | undefined): 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | undefined {
  if (!value) return undefined
  const mime = value === 'image/jpg' ? 'image/jpeg' : value
  return ACCEPTED.has(mime) ? mime as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' : undefined
}

function toBytes(value: string | Uint8Array): Uint8Array | null {
  if (value instanceof Uint8Array) return value
  if (typeof value !== 'string' || value.length === 0) return null
  try {
    return Uint8Array.from(Buffer.from(value, 'base64'))
  } catch {
    return null
  }
}
