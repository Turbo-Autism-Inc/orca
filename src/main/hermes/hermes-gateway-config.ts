import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getHermesHome } from './hermes-home-filesystem'

export const HERMES_GATEWAY_DEFAULT_HOST = '127.0.0.1'
export const HERMES_GATEWAY_DEFAULT_PORT = 8642

/** Where the local Hermes gateway listens and the key it expects. Main-only: never sent to a renderer. */
export type HermesGatewayConfig = {
  baseUrl: string
  apiKey: string | null
  enabled: boolean
}

/** Reads `KEY=value` lines, ignoring comments, `export ` and surrounding quotes. */
export function parseHermesEnv(text: string): Map<string, string> {
  const values = new Map<string, string>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^export\s+/, '')
    if (!line || line.startsWith('#')) {
      continue
    }
    const separator = line.indexOf('=')
    if (separator <= 0) {
      continue
    }
    let value = line.slice(separator + 1).trim()
    if (/^(['"]).*\1$/.test(value)) {
      value = value.slice(1, -1)
    } else {
      value = value.replace(/\s+#.*$/, '')
    }
    values.set(line.slice(0, separator).trim(), value)
  }
  return values
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

/** Only a loopback gateway is reachable: Orca never forwards the key to another machine. */
export function loopbackGatewayUrl(host: string, port: number): string | null {
  const normalized = host.trim().toLowerCase()
  if (!LOOPBACK_HOSTS.has(normalized) || !Number.isInteger(port) || port <= 0 || port > 65535) {
    return null
  }
  const urlHost = normalized === '::1' ? '[::1]' : normalized
  return `http://${urlHost}:${port}`
}

export function hermesGatewayConfigFromEnv(
  values: ReadonlyMap<string, string>
): HermesGatewayConfig | { error: 'non-loopback-host' } {
  // Why: Hermes binds 0.0.0.0 to serve a LAN; Orca still talks to it over loopback.
  const configuredHost = values.get('API_SERVER_HOST') ?? HERMES_GATEWAY_DEFAULT_HOST
  const host = configuredHost === '0.0.0.0' ? HERMES_GATEWAY_DEFAULT_HOST : configuredHost
  const port = Number(values.get('API_SERVER_PORT') ?? HERMES_GATEWAY_DEFAULT_PORT)
  const baseUrl = loopbackGatewayUrl(host, port)
  if (!baseUrl) {
    return { error: 'non-loopback-host' }
  }
  const enabled = /^(1|true|yes|on)$/i.test(values.get('API_SERVER_ENABLED') ?? '')
  const apiKey = values.get('API_SERVER_KEY')?.trim() || null
  return { baseUrl, apiKey, enabled }
}

export async function readHermesGatewayConfig(
  env: NodeJS.ProcessEnv = process.env
): Promise<HermesGatewayConfig | { error: 'non-loopback-host' | 'not-configured' }> {
  let text: string
  try {
    text = await readFile(join(getHermesHome(env), '.env'), 'utf8')
  } catch {
    return { error: 'not-configured' }
  }
  return hermesGatewayConfigFromEnv(parseHermesEnv(text))
}
