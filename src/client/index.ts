import { WebAccessOverlay } from './overlay.tsx'

interface ClientSlots {
  inject(name: string, callback: () => unknown): void
  register(options: { name: string; id?: string; order?: number }, component: unknown): () => void
}

interface ClientContext {
  effect(fn: () => void | (() => void), name?: string): void
  slots: ClientSlots
}

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'dsh-web-access',
    order: 80,
  }, WebAccessOverlay))
}
