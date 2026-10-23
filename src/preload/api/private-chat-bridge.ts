import { ipcRenderer } from 'electron'

export type PrivateChatApi = {
  get: () => Promise<boolean>
  /** Resolves to the mode main actually holds. */
  set: (enabled: boolean) => Promise<boolean>
}

export const privateChatApi: PrivateChatApi = {
  get: () => ipcRenderer.invoke('privateChat:get'),
  set: (enabled) => ipcRenderer.invoke('privateChat:set', enabled)
}
