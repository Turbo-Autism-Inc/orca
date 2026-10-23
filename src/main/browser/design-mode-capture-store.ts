import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  GRAB_BUDGET,
  type BrowserSaveDesignModeCaptureArgs,
  type BrowserSaveDesignModeCaptureResult
} from '../../shared/browser-grab-types'

const PNG_DATA_URL_PREFIX = 'data:image/png;base64,'
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
export const DESIGN_MODE_CAPTURES_PER_WORKTREE = 40
export const DESIGN_MODE_CAPTURES_DIRECTORY = 'design-mode-captures'

/** A workspace's capture folder: a hash, so ids with path separators can't escape or collide. */
export function designModeCaptureDirectory(root: string, worktreeId: string): string {
  const scope = createHash('sha256').update(worktreeId).digest('hex').slice(0, 16)
  return join(root, DESIGN_MODE_CAPTURES_DIRECTORY, scope)
}

function decodePng(dataUrl: string): Buffer | string {
  if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
    return 'not-a-png-data-url'
  }
  if (dataUrl.length > GRAB_BUDGET.screenshotMaxBytes) {
    return 'too-large'
  }
  const bytes = Buffer.from(dataUrl.slice(PNG_DATA_URL_PREFIX.length), 'base64')
  if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return 'not-a-png'
  }
  return bytes
}

async function pruneOldCaptures(directory: string, keep: number): Promise<void> {
  const names = (await readdir(directory)).filter((name) => name.endsWith('.png'))
  if (names.length <= keep) {
    return
  }
  const dated = await Promise.all(
    names.map(async (name) => ({ name, mtime: (await stat(join(directory, name))).mtimeMs }))
  )
  dated.sort((a, b) => b.mtime - a.mtime || b.name.localeCompare(a.name))
  await Promise.all(
    dated.slice(keep).map(({ name }) => unlink(join(directory, name)).catch(() => {}))
  )
}

/** Writes an element screenshot where an agent on this machine can read it. */
export async function saveDesignModeCapture(
  root: string,
  args: BrowserSaveDesignModeCaptureArgs,
  now: () => number = Date.now
): Promise<BrowserSaveDesignModeCaptureResult> {
  if (typeof args?.worktreeId !== 'string' || args.worktreeId.length === 0) {
    return { ok: false, reason: 'invalid-worktree' }
  }
  if (typeof args.dataUrl !== 'string') {
    return { ok: false, reason: 'not-a-png-data-url' }
  }
  const png = decodePng(args.dataUrl)
  if (typeof png === 'string') {
    return { ok: false, reason: png }
  }
  const directory = designModeCaptureDirectory(root, args.worktreeId)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  // Why the time prefix: names sort by age when mtimes tie on coarse filesystems.
  const path = join(directory, `${now().toString(36).padStart(9, '0')}-${randomUUID()}.png`)
  await writeFile(path, png, { mode: 0o600 })
  await pruneOldCaptures(directory, DESIGN_MODE_CAPTURES_PER_WORKTREE)
  return { ok: true, path }
}
