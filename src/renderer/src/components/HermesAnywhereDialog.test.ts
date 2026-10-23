import { describe, expect, it } from 'vitest'
import { isHermesAnywhereShortcut } from './HermesAnywhereDialog'

const key = (
  init: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> & { code: string }
) => ({
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...init
})

describe('isHermesAnywhereShortcut', () => {
  it('opens on Mod+Alt+H only', () => {
    expect(isHermesAnywhereShortcut(key({ code: 'KeyH', metaKey: true, altKey: true }), true)).toBe(
      true
    )
    expect(
      isHermesAnywhereShortcut(key({ code: 'KeyH', ctrlKey: true, altKey: true }), false)
    ).toBe(true)
    expect(isHermesAnywhereShortcut(key({ code: 'KeyH', ctrlKey: true, altKey: true }), true)).toBe(
      false
    )
    expect(
      isHermesAnywhereShortcut(
        key({ code: 'KeyH', ctrlKey: true, altKey: true, shiftKey: true }),
        false
      )
    ).toBe(false)
    expect(isHermesAnywhereShortcut(key({ code: 'KeyH', ctrlKey: true }), false)).toBe(false)
  })
})
