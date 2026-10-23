import type {
  HermesGatewaySendResult,
  HermesGatewayStatus
} from '../../shared/hermes-gateway-types'
import type { HermesGatewayConfig } from './hermes-gateway-config'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

const MAX_TURNS_KEPT = 40
const MAX_MESSAGE_LENGTH = 64 * 1024
const REQUEST_TIMEOUT_MS = 120_000

export type HermesGatewayClientDeps = {
  readConfig: () => Promise<HermesGatewayConfig | { error: string }>
  fetch: typeof fetch
}

/**
 * Talks to the local Hermes API server for every Orca pane. The key stays in this process;
 * conversations are kept in memory only, keyed by the pane's conversation id.
 */
export class HermesGatewayClient {
  private readonly conversations = new Map<string, ChatMessage[]>()

  constructor(private readonly deps: HermesGatewayClientDeps) {}

  async status(): Promise<HermesGatewayStatus> {
    const config = await this.deps.readConfig()
    if ('error' in config) {
      return { state: config.error === 'non-loopback-host' ? 'refused' : 'not-configured' }
    }
    if (!config.enabled || !config.apiKey) {
      return { state: 'not-configured', gatewayUrl: config.baseUrl }
    }
    try {
      const response = await this.deps.fetch(`${config.baseUrl}/health`, {
        signal: AbortSignal.timeout(3_000)
      })
      return { state: response.ok ? 'ready' : 'unreachable', gatewayUrl: config.baseUrl }
    } catch {
      return { state: 'unreachable', gatewayUrl: config.baseUrl }
    }
  }

  async send(conversationId: string, text: string): Promise<HermesGatewaySendResult> {
    if (
      typeof conversationId !== 'string' ||
      conversationId.length === 0 ||
      conversationId.length > 200
    ) {
      return { ok: false, error: 'invalid-conversation' }
    }
    if (typeof text !== 'string' || text.trim() === '' || text.length > MAX_MESSAGE_LENGTH) {
      return { ok: false, error: 'invalid-message' }
    }
    const config = await this.deps.readConfig()
    if ('error' in config || !config.enabled || !config.apiKey) {
      return { ok: false, error: 'not-configured' }
    }
    const history = this.conversations.get(conversationId) ?? []
    const messages: ChatMessage[] = [...history, { role: 'user', content: text }]
    let response: Response
    try {
      response = await this.deps.fetch(`${config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({ model: 'hermes-agent', messages, stream: false }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      })
    } catch {
      return { ok: false, error: 'unreachable' }
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: 'unauthorized' }
    }
    if (!response.ok) {
      return { ok: false, error: `http-${response.status}` }
    }
    const reply = readAssistantText(await response.json().catch(() => null))
    if (reply === null) {
      return { ok: false, error: 'malformed-response' }
    }
    messages.push({ role: 'assistant', content: reply })
    this.conversations.set(conversationId, messages.slice(-MAX_TURNS_KEPT * 2))
    return { ok: true, text: reply }
  }

  reset(conversationId: string): void {
    this.conversations.delete(conversationId)
  }
}

function readAssistantText(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('choices' in body)) {
    return null
  }
  const { choices } = body
  if (!Array.isArray(choices)) {
    return null
  }
  const message: unknown = choices[0]?.message
  if (typeof message !== 'object' || message === null || !('content' in message)) {
    return null
  }
  return typeof message.content === 'string' ? message.content : null
}
