import type { LinearComment } from './issue-types'
import type { LinearWorkflowState } from './workspace-types'

export type LinearLifecycleEvent = 'started' | 'pr-opened' | 'done'

/** The worktree facts the lifecycle depends on. */
export type LinearLifecycleSnapshot = {
  worktreeId: string
  issue: string
  linearWorkspaceId: string | null
  branch: string
  prNumber: number | null
  done: boolean
}

export type LinearLifecycleTransition = {
  event: LinearLifecycleEvent
  snapshot: LinearLifecycleSnapshot
}

const DONE_WORKSPACE_STATUS = 'completed'

export function linearLifecycleSnapshot(worktree: {
  id: string
  branch: string
  linkedLinearIssue: string | null
  linkedLinearIssueWorkspaceId?: string | null
  linkedPR: number | null
  workspaceStatus?: string
  isArchived: boolean
}): LinearLifecycleSnapshot | null {
  if (!worktree.linkedLinearIssue) {
    return null
  }
  return {
    worktreeId: worktree.id,
    issue: worktree.linkedLinearIssue,
    linearWorkspaceId: worktree.linkedLinearIssueWorkspaceId ?? null,
    branch: worktree.branch.replace(/^refs\/heads\//, ''),
    prNumber: worktree.linkedPR,
    done: worktree.isArchived || worktree.workspaceStatus === DONE_WORKSPACE_STATUS
  }
}

/** What changed between two observations. `previous` undefined means the workspace is new. */
export function nextLinearLifecycleEvents(
  previous: LinearLifecycleSnapshot | null | undefined,
  next: LinearLifecycleSnapshot
): LinearLifecycleTransition[] {
  const events: LinearLifecycleTransition[] = []
  const sameIssue = previous?.issue === next.issue
  if (!sameIssue) {
    events.push({ event: 'started', snapshot: next })
  }
  const hadPr = sameIssue && previous?.prNumber != null
  if (next.prNumber != null && !hadPr) {
    events.push({ event: 'pr-opened', snapshot: next })
  }
  if (next.done && !(sameIssue && previous?.done)) {
    events.push({ event: 'done', snapshot: next })
  }
  return events
}

function lowestPosition(states: readonly LinearWorkflowState[]): LinearWorkflowState | null {
  return [...states].sort((a, b) => a.position - b.position)[0] ?? null
}

/** The workflow state an event moves the issue to, or null to only comment. */
export function lifecycleWorkflowState(
  event: LinearLifecycleEvent,
  states: readonly LinearWorkflowState[]
): LinearWorkflowState | null {
  const started = states.filter((state) => state.type === 'started')
  if (event === 'started') {
    return lowestPosition(started)
  }
  if (event === 'pr-opened') {
    return lowestPosition(started.filter((state) => /review/i.test(state.name)))
  }
  return lowestPosition(states.filter((state) => state.type === 'completed'))
}

const STATE_RANK: Record<string, number> = {
  triage: 0,
  backlog: 1,
  unstarted: 2,
  started: 3,
  completed: 4,
  canceled: 4
}

/** Orca only moves an issue forward: never out of done or canceled, never back to an earlier type. */
export function isForwardLifecycleMove(
  current: { type: string; name: string },
  target: LinearWorkflowState
): boolean {
  if (current.type === target.type && current.name === target.name) {
    return false
  }
  const from = STATE_RANK[current.type] ?? 0
  const to = STATE_RANK[target.type] ?? 0
  return from < 4 && to >= from
}

const EVENT_LABEL: Record<LinearLifecycleEvent, string> = {
  started: 'started',
  'pr-opened': 'PR opened',
  done: 'done'
}

/** First line of the comment, also the idempotency marker. */
export function lifecycleCommentMarker(
  event: LinearLifecycleEvent,
  snapshot: Pick<LinearLifecycleSnapshot, 'branch' | 'prNumber'>
): string {
  const pr = event === 'pr-opened' && snapshot.prNumber != null ? ` (#${snapshot.prNumber})` : ''
  return `Orca: ${EVENT_LABEL[event]}${pr} · branch ${snapshot.branch}`
}

export function lifecycleComment(
  event: LinearLifecycleEvent,
  snapshot: Pick<LinearLifecycleSnapshot, 'branch' | 'prNumber'>,
  prUrl?: string | null
): string {
  const marker = lifecycleCommentMarker(event, snapshot)
  return prUrl ? `${marker}\n\n${prUrl}` : marker
}

export function hasLifecycleComment(comments: readonly LinearComment[], marker: string): boolean {
  return comments.some((comment) => comment.body.split('\n', 1)[0]?.trim() === marker)
}
