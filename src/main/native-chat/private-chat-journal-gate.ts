import { JournalHostDatabase } from './agent-session-journal/journal-host-database'
import { readJournalSessionEpoch } from './agent-session-journal/journal-row-table'

export type PrivateChatJournalGateDeps = {
  openMemoryHost: (stateDirectory: string) => JournalHostDatabase
  hasDiskHistory: (host: JournalHostDatabase, sessionId: string) => boolean
}

/**
 * Private Chat's single choke point. While the mode is on, a chat with no history on disk is
 * private for the rest of this process: its journal opens on an in-memory database. It fails
 * closed. If disk history can't be checked, the chat counts as private. If the memory database
 * can't open, the open throws and nothing falls back to disk.
 */
export class PrivateChatJournalGate {
  private enabled = false
  private readonly privateSessions = new Set<string>()
  private memoryHost: JournalHostDatabase | null = null

  constructor(private readonly deps: PrivateChatJournalGateDeps) {}

  setEnabled(enabled: boolean): boolean {
    this.enabled = enabled === true
    return this.enabled
  }

  isEnabled(): boolean {
    return this.enabled
  }

  isPrivate(sessionId: string): boolean {
    return this.privateSessions.has(sessionId)
  }

  journalHostFor(sessionId: string, diskHost: JournalHostDatabase): JournalHostDatabase {
    if (!this.privateSessions.has(sessionId)) {
      if (!this.enabled || this.diskHistoryExists(diskHost, sessionId)) {
        return diskHost
      }
      this.privateSessions.add(sessionId)
    }
    this.memoryHost ??= this.deps.openMemoryHost(diskHost.stateDirectory)
    return this.memoryHost
  }

  private diskHistoryExists(diskHost: JournalHostDatabase, sessionId: string): boolean {
    try {
      return this.deps.hasDiskHistory(diskHost, sessionId)
    } catch {
      return false
    }
  }
}

export const privateChatJournalGate = new PrivateChatJournalGate({
  openMemoryHost: (stateDirectory) => JournalHostDatabase.openInMemory(stateDirectory),
  hasDiskHistory: (host, sessionId) => readJournalSessionEpoch(host.db, sessionId) !== null
})
