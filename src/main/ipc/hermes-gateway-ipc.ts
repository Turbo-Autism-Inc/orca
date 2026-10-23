import { ipcMain } from 'electron'
import { HermesGatewayClient } from '../hermes/hermes-gateway-client'
import { readHermesGatewayConfig } from '../hermes/hermes-gateway-config'
import { isTrustedUIRenderer } from './ui'

let client: HermesGatewayClient | null = null

function gateway(): HermesGatewayClient {
  client ??= new HermesGatewayClient({ readConfig: () => readHermesGatewayConfig(), fetch })
  return client
}

/** The renderer reaches Hermes only through these channels; the API key never leaves main. */
export function registerHermesGatewayHandlers(): void {
  ipcMain.removeHandler('hermesGateway:status')
  ipcMain.removeHandler('hermesGateway:send')
  ipcMain.removeHandler('hermesGateway:reset')
  ipcMain.handle('hermesGateway:status', (event) =>
    isTrustedUIRenderer(event.sender) ? gateway().status() : { state: 'refused' }
  )
  ipcMain.handle('hermesGateway:send', (event, args: { conversationId: string; text: string }) =>
    isTrustedUIRenderer(event.sender)
      ? gateway().send(args?.conversationId, args?.text)
      : { ok: false, error: 'not-authorized' }
  )
  ipcMain.handle('hermesGateway:reset', (event, args: { conversationId: string }) => {
    if (isTrustedUIRenderer(event.sender) && typeof args?.conversationId === 'string') {
      gateway().reset(args.conversationId)
    }
  })
}
