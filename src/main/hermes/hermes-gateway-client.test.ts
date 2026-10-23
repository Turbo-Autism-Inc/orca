import { describe, expect, it, vi } from 'vitest'
import { HermesGatewayClient } from './hermes-gateway-client'

const config = { baseUrl: 'http://127.0.0.1:8642', apiKey: 'k-123', enabled: true }

function reply(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  })
}

describe('HermesGatewayClient', () => {
  it('keeps the key in main and carries each pane conversation forward', async () => {
    const fetch = vi.fn(async () => reply('pong'))
    const client = new HermesGatewayClient({ readConfig: async () => config, fetch })
    await expect(client.send('pane-a', 'ping')).resolves.toEqual({ ok: true, text: 'pong' })
    await client.send('pane-a', 'again')
    const [url, init] = fetch.mock.calls[1] as unknown as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:8642/v1/chat/completions')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer k-123')
    expect(JSON.parse(String(init.body)).messages).toEqual([
      { role: 'user', content: 'ping' },
      { role: 'assistant', content: 'pong' },
      { role: 'user', content: 'again' }
    ])
    client.reset('pane-a')
    await client.send('pane-a', 'fresh')
    expect(JSON.parse(String((fetch.mock.calls[2] as unknown as [string, RequestInit])[1].body)).messages).toHaveLength(1)
  })

  it('reports what went wrong without the key', async () => {
    const unauthorized = new HermesGatewayClient({
      readConfig: async () => config,
      fetch: vi.fn(async () => new Response('', { status: 401 }))
    })
    await expect(unauthorized.send('p', 'hi')).resolves.toEqual({ ok: false, error: 'unauthorized' })

    const off = new HermesGatewayClient({
      readConfig: async () => ({ ...config, enabled: false }),
      fetch: vi.fn()
    })
    await expect(off.send('p', 'hi')).resolves.toEqual({ ok: false, error: 'not-configured' })
    await expect(off.status()).resolves.toEqual({
      state: 'not-configured',
      gatewayUrl: 'http://127.0.0.1:8642'
    })

    const down = new HermesGatewayClient({
      readConfig: async () => config,
      fetch: vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      })
    })
    await expect(down.status()).resolves.toEqual({
      state: 'unreachable',
      gatewayUrl: 'http://127.0.0.1:8642'
    })
    await expect(down.send('p', '')).resolves.toEqual({ ok: false, error: 'invalid-message' })
  })
})
