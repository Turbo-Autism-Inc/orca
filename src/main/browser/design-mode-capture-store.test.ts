import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DESIGN_MODE_CAPTURES_PER_WORKTREE,
  designModeCaptureDirectory,
  saveDesignModeCapture
} from './design-mode-capture-store'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const dataUrl = `data:image/png;base64,${PNG.toString('base64')}`

let root = ''
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'orca-design-mode-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('saveDesignModeCapture', () => {
  it('writes the PNG into a folder only that workspace uses', async () => {
    const a = await saveDesignModeCapture(root, { worktreeId: 'repo::/a', dataUrl })
    const b = await saveDesignModeCapture(root, { worktreeId: 'repo::/b', dataUrl })
    if (!a.ok || !b.ok) {
      throw new Error('expected both saves to succeed')
    }
    expect(readFileSync(a.path).equals(PNG)).toBe(true)
    expect(dirname(a.path)).toBe(designModeCaptureDirectory(root, 'repo::/a'))
    expect(dirname(a.path)).not.toBe(dirname(b.path))
    // A workspace id with separators stays inside the captures root.
    expect(designModeCaptureDirectory(root, '../../etc')).toContain(join(root, 'design-mode-captures'))
  })

  it('refuses what is not a PNG', async () => {
    await expect(
      saveDesignModeCapture(root, { worktreeId: 'w', dataUrl: 'data:image/jpeg;base64,AAAA' })
    ).resolves.toEqual({ ok: false, reason: 'not-a-png-data-url' })
    await expect(
      saveDesignModeCapture(root, { worktreeId: 'w', dataUrl: 'data:image/png;base64,AAAA' })
    ).resolves.toEqual({ ok: false, reason: 'not-a-png' })
    await expect(saveDesignModeCapture(root, { worktreeId: '', dataUrl })).resolves.toEqual({
      ok: false,
      reason: 'invalid-worktree'
    })
  })

  it('keeps only the newest captures per workspace', async () => {
    let clock = 1_000
    for (let i = 0; i < DESIGN_MODE_CAPTURES_PER_WORKTREE + 3; i++) {
      await saveDesignModeCapture(root, { worktreeId: 'w', dataUrl }, () => clock++)
    }
    const names = readdirSync(designModeCaptureDirectory(root, 'w'))
    expect(names).toHaveLength(DESIGN_MODE_CAPTURES_PER_WORKTREE)
  })
})
