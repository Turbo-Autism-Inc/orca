import {
  linearAddIssueComment,
  linearGetIssue,
  linearIssueComments,
  linearUpdateIssue
} from '@/runtime/runtime-linear-issue-mutations'
import { linearTeamStates } from '@/runtime/runtime-linear-project-client'
import type { RuntimeLinearSettings } from '@/runtime/runtime-linear-client'
import {
  hasLifecycleComment,
  isForwardLifecycleMove,
  lifecycleComment,
  lifecycleCommentMarker,
  lifecycleWorkflowState,
  type LinearLifecycleTransition
} from '../../../shared/linear/issue-lifecycle-status'

export type LinearLifecyclePostDeps = {
  getIssue: typeof linearGetIssue
  teamStates: typeof linearTeamStates
  updateIssue: typeof linearUpdateIssue
  comments: typeof linearIssueComments
  addComment: typeof linearAddIssueComment
}

export type LinearLifecyclePostResult =
  | { kind: 'posted'; movedTo: string | null }
  | { kind: 'already-posted' }
  | { kind: 'issue-unavailable' }
  | { kind: 'failed'; detail: string }

const defaultDeps: LinearLifecyclePostDeps = {
  getIssue: linearGetIssue,
  teamStates: linearTeamStates,
  updateIssue: linearUpdateIssue,
  comments: linearIssueComments,
  addComment: linearAddIssueComment
}

const queues = new Map<string, Promise<unknown>>()

/** One worktree's posts run in order, so "PR opened" never lands before "started". */
function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
  const next = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(task)
  const tail = next.finally(() => {
    if (queues.get(key) === tail) {
      queues.delete(key)
    }
  })
  queues.set(key, tail)
  return next
}

/** Moves the issue forward for the step and posts its comment, at most once per step. */
export function postLinearIssueLifecycleStatus(
  settings: RuntimeLinearSettings,
  transition: LinearLifecycleTransition,
  options: { prUrl?: string | null; deps?: Partial<LinearLifecyclePostDeps> } = {}
): Promise<LinearLifecyclePostResult> {
  const deps = { ...defaultDeps, ...options.deps }
  const { event, snapshot } = transition
  return enqueue(snapshot.worktreeId, async () => {
    try {
      const issue = await deps.getIssue(
        settings,
        snapshot.issue,
        snapshot.linearWorkspaceId ?? undefined
      )
      if (!issue?.team?.id) {
        return { kind: 'issue-unavailable' }
      }
      const workspaceId = snapshot.linearWorkspaceId ?? issue.workspaceId
      const marker = lifecycleCommentMarker(event, snapshot)
      if (hasLifecycleComment(await deps.comments(settings, issue.id, workspaceId), marker)) {
        return { kind: 'already-posted' }
      }
      const target = lifecycleWorkflowState(
        event,
        await deps.teamStates(settings, issue.team.id, workspaceId)
      )
      let movedTo: string | null = null
      if (target && isForwardLifecycleMove(issue.state, target)) {
        const moved = await deps.updateIssue(
          settings,
          issue.id,
          { stateId: target.id },
          workspaceId
        )
        if (moved.ok === false) {
          return { kind: 'failed', detail: moved.error }
        }
        movedTo = target.name
      }
      const posted = await deps.addComment(
        settings,
        issue.id,
        lifecycleComment(event, snapshot, options.prUrl),
        workspaceId
      )
      if (posted.ok === false) {
        return { kind: 'failed', detail: posted.error }
      }
      return { kind: 'posted', movedTo }
    } catch (error) {
      return { kind: 'failed', detail: error instanceof Error ? error.message : String(error) }
    }
  })
}
