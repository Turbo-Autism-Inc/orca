import { describe, expect, it, vi } from 'vitest'
import type { LinearIssue } from '../../../shared/linear/issue-types'
import type { LinearWorkflowState } from '../../../shared/linear/workspace-types'
import { postLinearIssueLifecycleStatus } from './linear-issue-lifecycle-status'

vi.mock('@/runtime/runtime-linear-issue-mutations', () => ({
  linearAddIssueComment: vi.fn(),
  linearGetIssue: vi.fn(),
  linearIssueComments: vi.fn(),
  linearUpdateIssue: vi.fn()
}))
vi.mock('@/runtime/runtime-linear-project-client', () => ({ linearTeamStates: vi.fn() }))

const states: LinearWorkflowState[] = [
  { id: 'todo', name: 'Todo', type: 'unstarted', color: '', position: 0 },
  { id: 'prog', name: 'In Progress', type: 'started', color: '', position: 1 },
  { id: 'rev', name: 'In Review', type: 'started', color: '', position: 2 },
  { id: 'done', name: 'Done', type: 'completed', color: '', position: 3 }
]

function issue(stateName: string, type: string): LinearIssue {
  // SAFETY: the poster reads only id, team, state and workspaceId.
  return {
    id: 'issue-1',
    identifier: 'ENG-1',
    team: { id: 'team-1', name: 'Eng', key: 'ENG' },
    state: { name: stateName, type, color: '' }
  } as LinearIssue
}

function deps(current: LinearIssue, bodies: string[] = []) {
  return {
    getIssue: vi.fn(async () => current),
    teamStates: vi.fn(async () => states),
    updateIssue: vi.fn(async () => ({ ok: true as const })),
    comments: vi.fn(async () => bodies.map((body, i) => ({ id: `c${i}`, body, createdAt: '' }))),
    addComment: vi.fn(async (..._args: unknown[]) => ({ ok: true as const, id: 'new' }))
  }
}

const snapshot = {
  worktreeId: 'wt',
  issue: 'ENG-1',
  linearWorkspaceId: null,
  branch: 'eng-1',
  prNumber: 9,
  done: false
}

describe('postLinearIssueLifecycleStatus', () => {
  it('moves the issue to review and comments with the PR', async () => {
    const d = deps(issue('In Progress', 'started'))
    const result = await postLinearIssueLifecycleStatus(
      { kind: 'local' },
      { event: 'pr-opened', snapshot },
      { prUrl: 'https://github.com/o/r/pull/9', deps: d }
    )
    expect(result).toEqual({ kind: 'posted', movedTo: 'In Review' })
    expect(d.updateIssue).toHaveBeenCalledWith(
      { kind: 'local' },
      'issue-1',
      { stateId: 'rev' },
      undefined
    )
    expect(d.addComment.mock.calls[0][2]).toBe(
      'Orca: PR opened (#9) · branch eng-1\n\nhttps://github.com/o/r/pull/9'
    )
  })

  it('posts nothing a second time', async () => {
    const d = deps(issue('In Review', 'started'), ['Orca: PR opened (#9) · branch eng-1'])
    await expect(
      postLinearIssueLifecycleStatus(
        { kind: 'local' },
        { event: 'pr-opened', snapshot },
        { deps: d }
      )
    ).resolves.toEqual({ kind: 'already-posted' })
    expect(d.updateIssue).not.toHaveBeenCalled()
    expect(d.addComment).not.toHaveBeenCalled()
  })

  it('comments without reopening an issue that is already done', async () => {
    const d = deps(issue('Done', 'completed'))
    await expect(
      postLinearIssueLifecycleStatus({ kind: 'local' }, { event: 'started', snapshot }, { deps: d })
    ).resolves.toEqual({ kind: 'posted', movedTo: null })
    expect(d.updateIssue).not.toHaveBeenCalled()
  })

  it('reports a failed write instead of throwing', async () => {
    const d = deps(issue('Todo', 'unstarted'))
    d.updateIssue.mockResolvedValueOnce({ ok: false, error: 'Not connected to Linear' } as never)
    await expect(
      postLinearIssueLifecycleStatus({ kind: 'local' }, { event: 'started', snapshot }, { deps: d })
    ).resolves.toEqual({ kind: 'failed', detail: 'Not connected to Linear' })
    expect(d.addComment).not.toHaveBeenCalled()
  })
})
