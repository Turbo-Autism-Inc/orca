import { useSyncExternalStore } from 'react'

let enabled = false
const listeners = new Set<() => void>()

function publish(next: boolean): void {
  if (next !== enabled) {
    enabled = next
    for (const listener of listeners) {
      listener()
    }
  }
}

/** Mirrors main's switch. Off until main confirms on, so the UI never claims privacy main lacks. */
export function isPrivateChatModeOn(): boolean {
  return enabled
}

export async function setPrivateChatMode(next: boolean): Promise<boolean> {
  // Why first: while turning on, nothing renderer-side persists before main has answered.
  if (next) {
    publish(true)
  }
  try {
    publish((await window.api.privateChat?.set(next)) === true)
  } catch {
    publish(false)
  }
  return enabled
}

export function syncPrivateChatModeFromMain(): void {
  void window.api.privateChat
    ?.get()
    .then((value) => publish(value === true))
    .catch(() => publish(false))
}

export function usePrivateChatMode(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    isPrivateChatModeOn
  )
}
