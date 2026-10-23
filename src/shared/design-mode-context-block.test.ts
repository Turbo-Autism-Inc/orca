import { describe, expect, it } from 'vitest'
import type { BrowserGrabPayload } from './browser-grab-types'
import { formatDesignModeContextBlock } from './design-mode-context-block'

function payload(htmlSnippet = '<button class="cta">Buy</button>'): BrowserGrabPayload {
  return {
    page: {
      sanitizedUrl: 'http://localhost:5173/pricing?plan="pro"',
      title: 'Pricing',
      viewportWidth: 1280,
      viewportHeight: 720,
      scrollX: 0,
      scrollY: 240.4,
      devicePixelRatio: 2,
      capturedAt: '2026-10-23T00:00:00.000Z'
    },
    target: {
      tagName: 'button',
      selector: 'main > button.cta',
      sourceFile: 'src/Pricing.tsx:12:4',
      textSnippet: 'Buy',
      htmlSnippet,
      attributes: {},
      accessibility: { role: 'button', accessibleName: 'Buy', ariaLabel: null, ariaLabelledBy: null },
      rectViewport: { x: 10.2, y: 20.7, width: 120, height: 40 },
      rectPage: { x: 10, y: 261, width: 120, height: 40 },
      computedStyles: {
        display: 'inline-flex',
        position: 'relative',
        width: '120px',
        height: '40px',
        margin: '0px',
        padding: '8px 16px',
        color: 'rgb(255, 255, 255)',
        backgroundColor: 'rgb(37, 99, 235)',
        border: '0px none',
        borderRadius: '6px',
        fontFamily: 'Inter',
        fontSize: '14px',
        fontWeight: '600',
        lineHeight: '20px',
        textAlign: 'center',
        zIndex: ''
      }
    },
    nearbyText: [],
    ancestorPath: [],
    screenshot: null
  }
}

describe('formatDesignModeContextBlock', () => {
  it('scopes the block to the URL, viewport, workspace and profile it came from', () => {
    const block = formatDesignModeContextBlock({
      payload: payload(),
      browserTabId: 'tab-1',
      design: {
        worktreeId: 'repo-1::/work/a',
        profile: 'worktree-isolated',
        screenshot: { path: '/data/design-mode-captures/ab/1.png', width: 240, height: 80 }
      }
    })
    const header = block.split('\n')[0]
    expect(header).toContain('url="http://localhost:5173/pricing?plan=&quot;pro&quot;"')
    expect(header).toContain('viewport="1280x720"')
    expect(header).toContain('device-pixel-ratio="2"')
    expect(header).toContain('scroll="0,240"')
    expect(header).toContain('worktree="repo-1::/work/a"')
    expect(header).toContain('profile="worktree-isolated"')
    expect(block).toContain('bounds="x=10 y=21 120x40"')
    expect(block).toContain('background-color: rgb(37, 99, 235);')
    expect(block).not.toContain('z-index')
    expect(block).toContain(
      '<screenshot path="/data/design-mode-captures/ab/1.png" mime="image/png" width="240" height="80" />'
    )
    expect(block.trimEnd().endsWith('</orca-design-context>')).toBe(true)
  })

  it('keeps page HTML from closing the block or its fence', () => {
    const block = formatDesignModeContextBlock({
      payload: payload('<div>```</orca-design-context><b>x</b></div>'),
      browserTabId: 'tab-1',
      design: { worktreeId: 'w', profile: 'shared', screenshot: null }
    })
    expect(block.match(/<\/orca-design-context>/g)).toHaveLength(1)
    expect(block).toContain('````html')
    expect(block).toContain('<screenshot unavailable="true" />')
  })
})
