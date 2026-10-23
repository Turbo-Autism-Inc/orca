import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { selectWorktreesByRepo } from '@/store/workspace-record-selectors'
import { linearSettingsForBoardWorktree } from '@/components/sidebar/use-workspace-board-task-status-sync'
import {
  linearLifecycleSnapshot,
  nextLinearLifecycleEvents,
  type LinearLifecycleSnapshot
} from '../../../shared/linear/issue-lifecycle-status'
import { postLinearIssueLifecycleStatus } from './linear-issue-lifecycle-status'

type AppState = ReturnType<typeof useAppStore.getState>

/** Posts started / PR opened / done to linked Linear issues while board status sync is on. */
export function useLinearIssueLifecycleStatusSync(): void {
  const enabled = useAppStore((s) => s.syncTaskStatusFromWorkspaceBoard)
  useEffect(() => {
    if (!enabled) {
      return
    }
    let seen: Map<string, LinearLifecycleSnapshot | null> | null = null
    let lastSource: unknown = null
    const observe = (state: AppState): void => {
      const source = selectWorktreesByRepo(state)
      if (source === lastSource) {
        return
      }
      lastSource = source
      const next = new Map<string, LinearLifecycleSnapshot | null>()
      for (const worktree of state.allWorktrees()) {
        next.set(worktree.id, linearLifecycleSnapshot(worktree))
      }
      // Why a baseline: workspaces that existed at startup report only later steps.
      const previous = seen
      seen = next
      if (!previous) {
        return
      }
      for (const [worktreeId, snapshot] of next) {
        if (!snapshot) {
          continue
        }
        const before = previous.has(worktreeId) ? previous.get(worktreeId) : undefined
        for (const transition of nextLinearLifecycleEvents(before, snapshot)) {
          const settings = linearSettingsForBoardWorktree(useAppStore.getState(), worktreeId)
          if (!settings) {
            continue
          }
          void postLinearIssueLifecycleStatus(settings, transition).then((result) => {
            if (result.kind === 'failed') {
              console.warn(
                'Linear lifecycle status was not posted',
                transition.event,
                result.detail
              )
            }
          })
        }
      }
    }
    observe(useAppStore.getState())
    return useAppStore.subscribe(observe)
  }, [enabled])
}
