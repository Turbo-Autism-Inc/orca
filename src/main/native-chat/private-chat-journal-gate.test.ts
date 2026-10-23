import { describe, expect, it, vi } from 'vitest'
import type { JournalHostDatabase } from './agent-session-journal/journal-host-database'
import { PrivateChatJournalGate } from './private-chat-journal-gate'

function host(name: string): JournalHostDatabase {
  // SAFETY: the gate reads only stateDirectory; the rest is the deps' business.
  return { name, stateDirectory: '/state' } as unknown as JournalHostDatabase
}

function gate(diskSessions: string[], hasDiskHistory?: () => boolean) {
  const memory = host('memory')
  const openMemoryHost = vi.fn(() => memory)
  const subject = new PrivateChatJournalGate({
    openMemoryHost,
    hasDiskHistory: hasDiskHistory ?? ((_host, sessionId) => diskSessions.includes(sessionId))
  })
  return { subject, memory, openMemoryHost }
}

describe('PrivateChatJournalGate', () => {
  it('keeps every chat on disk while the mode is off', () => {
    const { subject, openMemoryHost } = gate([])
    const disk = host('disk')
    expect(subject.journalHostFor('claude_a', disk)).toBe(disk)
    expect(openMemoryHost).not.toHaveBeenCalled()
  })

  it('opens a chat started while on in memory, and keeps it there after the mode is off', () => {
    const { subject, memory } = gate(['claude_old'])
    const disk = host('disk')
    subject.setEnabled(true)
    expect(subject.journalHostFor('claude_new', disk)).toBe(memory)
    // A chat with history on disk stays a disk chat; it is never split across both.
    expect(subject.journalHostFor('claude_old', disk)).toBe(disk)
    subject.setEnabled(false)
    expect(subject.journalHostFor('claude_new', disk)).toBe(memory)
    expect(subject.isPrivate('claude_new')).toBe(true)
  })

  it('fails closed when disk history cannot be read or memory cannot open', () => {
    const unreadable = gate([], () => {
      throw new Error('SQLITE_BUSY')
    })
    unreadable.subject.setEnabled(true)
    expect(unreadable.subject.journalHostFor('claude_x', host('disk'))).toBe(unreadable.memory)

    const broken = new PrivateChatJournalGate({
      openMemoryHost: () => {
        throw new Error('out of memory')
      },
      hasDiskHistory: () => false
    })
    broken.setEnabled(true)
    const disk = host('disk')
    expect(() => broken.journalHostFor('claude_y', disk)).toThrow('out of memory')
    expect(() => broken.journalHostFor('claude_y', disk)).toThrow('out of memory')
  })
})
