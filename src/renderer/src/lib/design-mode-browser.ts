import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { getDesignModeBrowserProfileOwner } from '../../../shared/browser-profile-scope'
import type {
  BrowserAnnotationDesignContext,
  BrowserAnnotationIntent,
  BrowserGrabPayload,
  BrowserPageAnnotation,
  DesignModeProfileIsolation
} from '../../../shared/browser-grab-types'
import {
  createBrowserAnnotationId,
  createBrowserAnnotationPayload,
  DEFAULT_BROWSER_ANNOTATION_PRIORITY
} from '@/components/browser-pane/describe-page/browser-annotation-geometry'
import type { BrowserSessionProfile } from '../../../shared/browser-workspace-types'

/** Whether a page's profile is the one its workspace owns, so its cookies and storage are its own. */
export function designModeProfileIsolation(
  profiles: readonly BrowserSessionProfile[],
  worktreeId: string,
  sessionProfileId: string | null | undefined
): DesignModeProfileIsolation {
  const owner = getDesignModeBrowserProfileOwner(worktreeId)
  const profile = sessionProfileId ? profiles.find((entry) => entry.id === sessionProfileId) : null
  return owner && profile?.owner?.kind === owner.kind && profile.owner.id === owner.id
    ? 'worktree-isolated'
    : 'shared'
}

export function useDesignModeIsolated(
  worktreeId: string,
  sessionProfileId: string | null | undefined
): boolean {
  return useAppStore(
    (s) =>
      designModeProfileIsolation(s.browserSessionProfiles, worktreeId, sessionProfileId) ===
      'worktree-isolated'
  )
}

/** Saves the element screenshot for a local agent and scopes the capture to its workspace. */
export async function captureDesignModeContext(args: {
  payload: BrowserGrabPayload
  worktreeId: string
  sessionProfileId?: string | null
}): Promise<BrowserAnnotationDesignContext> {
  const profile = designModeProfileIsolation(
    useAppStore.getState().browserSessionProfiles,
    args.worktreeId,
    args.sessionProfileId
  )
  const shot = args.payload.screenshot
  let screenshot: BrowserAnnotationDesignContext['screenshot'] = null
  if (shot?.dataUrl) {
    try {
      const saved = await window.api.browser.saveDesignModeCapture({
        worktreeId: args.worktreeId,
        dataUrl: shot.dataUrl
      })
      screenshot = saved.ok ? { path: saved.path, width: shot.width, height: shot.height } : null
    } catch {
      // The block still carries HTML and CSS; it says the screenshot is unavailable.
    }
  }
  return { worktreeId: args.worktreeId, profile, screenshot }
}

/** Runs `commit` at once without a workspace (no scope to add), else once the capture is saved. */
export function withDesignModeContext(
  args: { payload: BrowserGrabPayload; worktreeId?: string; sessionProfileId?: string | null },
  commit: (design: BrowserAnnotationDesignContext | undefined) => void
): void {
  // Why not async throughout: without a workspace the annotation lands in the same tick.
  const { worktreeId } = args
  if (!worktreeId) {
    commit(undefined)
    return
  }
  void captureDesignModeContext({ ...args, worktreeId }).then(commit)
}

/** A new annotation, with Design Mode's scope when its workspace is known. */
export function newBrowserPageAnnotation(args: {
  browserPageId: string
  comment: string
  intent: BrowserAnnotationIntent
  payload: BrowserGrabPayload
  design: BrowserAnnotationDesignContext | undefined
}): BrowserPageAnnotation {
  return {
    id: createBrowserAnnotationId(),
    browserPageId: args.browserPageId,
    comment: args.comment,
    intent: args.intent,
    priority: DEFAULT_BROWSER_ANNOTATION_PRIORITY,
    createdAt: new Date().toISOString(),
    payload: createBrowserAnnotationPayload(args.payload),
    ...(args.design ? { design: args.design } : {})
  }
}

/** Focuses the workspace's one Design Mode browser, or opens it on the workspace's own profile. */
export function openDesignModeBrowserTab(worktreeId: string, url: string): boolean {
  const owner = getDesignModeBrowserProfileOwner(worktreeId)
  if (!owner) {
    return false
  }
  const state = useAppStore.getState()
  const name = state.getKnownWorktreeById(worktreeId)?.displayName || worktreeId
  const profile = state.ensureManagedBrowserSessionProfile(
    owner,
    translate('settings.browser.profileScope.worktreeProfileLabel', 'Workspace: {{name}}', {
      name
    })
  )
  const existing = (state.browserTabsByWorktree[worktreeId] ?? []).find(
    (tab) => tab.sessionProfileId === profile.sessionProfileId
  )
  if (existing) {
    state.setActiveBrowserTab(existing.id, worktreeId)
    return true
  }
  state.createBrowserTab(worktreeId, url, {
    activate: true,
    sessionProfileId: profile.sessionProfileId,
    ...(profile.sessionPartition ? { sessionPartition: profile.sessionPartition } : {})
  })
  return true
}
