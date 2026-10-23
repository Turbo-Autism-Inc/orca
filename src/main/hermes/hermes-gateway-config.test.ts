import { describe, expect, it } from 'vitest'
import {
  hermesGatewayConfigFromEnv,
  loopbackGatewayUrl,
  parseHermesEnv
} from './hermes-gateway-config'

describe('hermes gateway config', () => {
  it('reads the API server settings from the Hermes .env', () => {
    const env = parseHermesEnv(
      '# comment\nexport API_SERVER_ENABLED=true\nAPI_SERVER_KEY="s3cret"\nAPI_SERVER_PORT=9000 # local\n'
    )
    expect(hermesGatewayConfigFromEnv(env)).toEqual({
      baseUrl: 'http://127.0.0.1:9000',
      apiKey: 's3cret',
      enabled: true
    })
  })

  it('talks to a LAN-bound server over loopback and refuses any other host', () => {
    expect(hermesGatewayConfigFromEnv(new Map([['API_SERVER_HOST', '0.0.0.0']]))).toMatchObject({
      baseUrl: 'http://127.0.0.1:8642',
      enabled: false,
      apiKey: null
    })
    expect(
      hermesGatewayConfigFromEnv(new Map([['API_SERVER_HOST', 'hermes.example.com']]))
    ).toEqual({ error: 'non-loopback-host' })
    expect(loopbackGatewayUrl('::1', 8642)).toBe('http://[::1]:8642')
    expect(loopbackGatewayUrl('127.0.0.1', 70000)).toBeNull()
  })
})
