import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createMemoryNativeChatComposerDraftStorage,
  withoutWritesWhilePrivate
} from './native-chat-composer-draft-storage'
import { setPrivateChatMode } from '@/lib/private-chat-mode'

const set = vi.fn(async (enabled: boolean) => enabled)
vi.stubGlobal('window', { api: { privateChat: { set, get: async () => false } } })

afterEach(async () => {
  await setPrivateChatMode(false)
})

describe('withoutWritesWhilePrivate', () => {
  it('keeps drafts out of storage while Private Chat is on', async () => {
    const inner = createMemoryNativeChatComposerDraftStorage()
    const storage = withoutWritesWhilePrivate(inner)
    // SAFETY: the wrapper passes drafts through without reading them.
    const draft = { text: 'secret', savedAt: 1 } as never
    await setPrivateChatMode(true)
    await storage.write('scope', draft)
    await storage.update('scope', () => draft)
    expect(inner.drafts.size).toBe(0)

    await setPrivateChatMode(false)
    await storage.write('scope', draft)
    expect(inner.drafts.get('scope')).toBe(draft)
  })

  it('stays off when main refuses the switch', async () => {
    set.mockResolvedValueOnce(false)
    await expect(setPrivateChatMode(true)).resolves.toBe(false)
  })
})
