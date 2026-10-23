import { ipcRenderer } from 'electron'
import type {
  HermesGatewaySendResult,
  HermesGatewayStatus
} from '../../shared/hermes-gateway-types'

export type HermesGatewayApi = {
  status: () => Promise<HermesGatewayStatus>
  send: (args: { conversationId: string; text: string }) => Promise<HermesGatewaySendResult>
  reset: (args: { conversationId: string }) => Promise<void>
}

export const hermesGatewayApi: HermesGatewayApi = {
  status: () => ipcRenderer.invoke('hermesGateway:status'),
  send: (args) => ipcRenderer.invoke('hermesGateway:send', args),
  reset: (args) => ipcRenderer.invoke('hermesGateway:reset', args)
}
