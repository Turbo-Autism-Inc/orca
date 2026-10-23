// A quote sent from outside the composer: the handle appends it, and the submit hook sends the
// draft on the render that holds it, so the send reads the appended text.
const pendingScopes = new Set<string>()

export function requestNativeChatSendAfterAppend(scopeKey: string): void {
  pendingScopes.add(scopeKey)
}

export function takeNativeChatSendAfterAppend(scopeKey: string): boolean {
  return pendingScopes.delete(scopeKey)
}
