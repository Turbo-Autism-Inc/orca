import { describe, expect, it } from 'vitest'
import type { LinearWorkflowState } from './workspace-types'
import {
  hasLifecycleComment,
  isForwardLifecycleMove,
  lifecycleComment,
  lifecycleWorkflowState,
  linearLifecycleSnapshot,
  nextLinearLifecycleEvents,
  type LinearLifecycleSnapshot
} from './issue-lifecycle-status'

const base: {
  id: string
  branch: string
  linkedLinearIssue: string | null
  linkedPR: number | null
  isArchived: boolean
} = {
  id: 'repo::/w/a',
  branch: 'refs/heads/eng-12-fix',
  linkedLinearIssue: 'ENG-12',
  linkedPR: null,
  isArchived: false
}

function snap(overrides: Partial<typeof base> & { workspaceStatus?: string } = {}) {
  const snapshot = linearLifecycleSnapshot({ ...base, ...overrides })
  if (!snapshot) {
    throw new Error('expected a linked snapshot')
  }
  return snapshot
}

const events = (prev: LinearLifecycleSnapshot | null | undefined, next: LinearLifecycleSnapshot) =>
  nextLinearLifecycleEvents(prev, next).map((transition) => transition.event)

const state = (id: string, name: string, type: string, position: number): LinearWorkflowState => ({
  id,
  name,
  type,
  position,
  color: '#000'
})

describe('nextLinearLifecycleEvents', () => {
  it('reports each lifecycle step once as the workspace moves through it', () => {
    expect(linearLifecycleSnapshot({ ...base, linkedLinearIssue: null })).toBeNull()
    expect(snap().branch).toBe('eng-12-fix')
    expect(events(undefined, snap())).toEqual(['started'])
    expect(events(snap(), snap())).toEqual([])
    expect(events(snap(), snap({ linkedPR: 7 }))).toEqual(['pr-opened'])
    expect(events(snap({ linkedPR: 7 }), snap({ linkedPR: 7 }))).toEqual([])
    expect(
      events(snap({ linkedPR: 7 }), snap({ linkedPR: 7, workspaceStatus: 'completed' }))
    ).toEqual(['done'])
    expect(events(snap(), snap({ isArchived: true }))).toEqual(['done'])
  })

  it('treats a newly linked issue as a fresh start', () => {
    expect(events(null, snap({ linkedPR: 3 }))).toEqual(['started', 'pr-opened'])
    expect(events(snap({ linkedLinearIssue: 'ENG-1' }), snap())).toEqual(['started'])
  })
})

describe('lifecycleWorkflowState', () => {
  const states = [
    state('b', 'Backlog', 'backlog', 0),
    state('p', 'In Progress', 'started', 1),
    state('r', 'In Review', 'started', 2),
    state('d', 'Done', 'completed', 3),
    state('x', 'Canceled', 'canceled', 4)
  ]

  it('picks the team state for each step and comments only when none fits', () => {
    expect(lifecycleWorkflowState('started', states)?.id).toBe('p')
    expect(lifecycleWorkflowState('pr-opened', states)?.id).toBe('r')
    expect(lifecycleWorkflowState('done', states)?.id).toBe('d')
    expect(
      lifecycleWorkflowState(
        'pr-opened',
        states.filter((s) => s.id !== 'r')
      )
    ).toBeNull()
  })

  it('never moves an issue backwards or out of done', () => {
    expect(isForwardLifecycleMove({ type: 'backlog', name: 'Backlog' }, states[1])).toBe(true)
    expect(isForwardLifecycleMove({ type: 'started', name: 'In Review' }, states[1])).toBe(true)
    expect(isForwardLifecycleMove({ type: 'completed', name: 'Done' }, states[1])).toBe(false)
    expect(isForwardLifecycleMove({ type: 'canceled', name: 'Canceled' }, states[3])).toBe(false)
    expect(isForwardLifecycleMove({ type: 'started', name: 'In Progress' }, states[1])).toBe(false)
  })
})

describe('lifecycle comments', () => {
  it('marks the comment so a repost is detected', () => {
    const body = lifecycleComment('pr-opened', { branch: 'eng-12', prNumber: 7 }, 'https://x/pr/7')
    expect(body).toBe('Orca: PR opened (#7) · branch eng-12\n\nhttps://x/pr/7')
    const comments = [{ id: 'c', body, createdAt: '' }]
    expect(hasLifecycleComment(comments, 'Orca: PR opened (#7) · branch eng-12')).toBe(true)
    expect(hasLifecycleComment(comments, 'Orca: done · branch eng-12')).toBe(false)
  })
})
