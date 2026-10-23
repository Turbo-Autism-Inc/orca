import { ipcMain } from 'electron'
import { privateChatJournalGate } from '../native-chat/private-chat-journal-gate'
import { isTrustedUIRenderer } from './ui'

/** Private Chat's switch lives in main memory only, so a restart always starts with it off. */
export function registerPrivateChatHandlers(): void {
  ipcMain.removeHandler('privateChat:get')
  ipcMain.removeHandler('privateChat:set')
  ipcMain.handle('privateChat:get', () => privateChatJournalGate.isEnabled())
  ipcMain.handle('privateChat:set', (event, enabled: unknown) =>
    isTrustedUIRenderer(event.sender)
      ? privateChatJournalGate.setEnabled(enabled === true)
      : privateChatJournalGate.isEnabled()
  )
}
