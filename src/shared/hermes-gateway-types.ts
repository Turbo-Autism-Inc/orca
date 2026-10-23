/** What a renderer may learn about the local Hermes gateway: never the key. */
export type HermesGatewayStatus = {
  state: 'ready' | 'not-configured' | 'unreachable' | 'refused'
  gatewayUrl?: string
}

export type HermesGatewaySendResult = { ok: true; text: string } | { ok: false; error: string }
