import type {
  BrowserAnnotationDesignContext,
  BrowserGrabComputedStyles,
  BrowserGrabPayload
} from './browser-grab-types'

const BLOCK_TAG = 'orca-design-context'
const BLOCK_VERSION = 1

const CSS_PROPERTY_NAMES: readonly [keyof BrowserGrabComputedStyles, string][] = [
  ['display', 'display'],
  ['position', 'position'],
  ['width', 'width'],
  ['height', 'height'],
  ['margin', 'margin'],
  ['padding', 'padding'],
  ['color', 'color'],
  ['backgroundColor', 'background-color'],
  ['border', 'border'],
  ['borderRadius', 'border-radius'],
  ['fontFamily', 'font-family'],
  ['fontSize', 'font-size'],
  ['fontWeight', 'font-weight'],
  ['lineHeight', 'line-height'],
  ['textAlign', 'text-align'],
  ['zIndex', 'z-index']
]

export type DesignModeContextBlockInput = {
  payload: BrowserGrabPayload | Omit<BrowserGrabPayload, 'screenshot'>
  design: BrowserAnnotationDesignContext
  browserTabId: string
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replace(/[\r\n\t]+/g, ' ')
}

function attributes(entries: readonly [string, string | number][]): string {
  return entries.map(([name, value]) => `${name}="${escapeAttribute(String(value))}"`).join(' ')
}

// Why: page HTML is untrusted; a literal closing tag inside it must not end the block for the agent.
function neutralizeBlockTags(content: string): string {
  return content.replace(new RegExp(`<(/?)${BLOCK_TAG}`, 'gi'), '<$1\u200b' + BLOCK_TAG)
}

function fence(language: string, content: string): string[] {
  let longest = 2
  let run = 0
  for (const char of content) {
    run = char === '`' ? run + 1 : 0
    longest = Math.max(longest, run)
  }
  const marker = '`'.repeat(longest + 1)
  return [`${marker}${language}`, content, marker]
}

function cssLines(styles: BrowserGrabComputedStyles): string[] {
  return CSS_PROPERTY_NAMES.filter(([key]) => Boolean(styles[key])).map(
    ([key, name]) => `${name}: ${neutralizeBlockTags(styles[key]).replace(/[\r\n;]+/g, ' ')};`
  )
}

/** The machine-readable Design Mode context for one captured element. */
export function formatDesignModeContextBlock(input: DesignModeContextBlockInput): string {
  const { page, target } = input.payload
  const rect = target.rectViewport
  const header = attributes([
    ['version', BLOCK_VERSION],
    ['url', page.sanitizedUrl],
    ['viewport', `${page.viewportWidth}x${page.viewportHeight}`],
    ['device-pixel-ratio', page.devicePixelRatio],
    ['scroll', `${Math.round(page.scrollX)},${Math.round(page.scrollY)}`],
    ['worktree', input.design.worktreeId],
    ['browser-tab', input.browserTabId],
    ['profile', input.design.profile],
    ['captured-at', page.capturedAt]
  ])
  const element = attributes([
    ['selector', target.selector],
    ['tag', target.tagName],
    [
      'bounds',
      `x=${Math.round(rect.x)} y=${Math.round(rect.y)} ${Math.round(rect.width)}x${Math.round(rect.height)}`
    ],
    ...(target.sourceFile ? ([['source', target.sourceFile]] as [string, string][]) : [])
  ])
  const lines = [`<${BLOCK_TAG} ${header}>`, `<element ${element} />`]
  lines.push('<html>', ...fence('html', neutralizeBlockTags(target.htmlSnippet)), '</html>')
  lines.push('<computed-css>', ...cssLines(target.computedStyles), '</computed-css>')
  const shot = input.design.screenshot
  lines.push(
    shot
      ? `<screenshot ${attributes([
          ['path', shot.path],
          ['mime', 'image/png'],
          ['width', shot.width],
          ['height', shot.height]
        ])} />`
      : '<screenshot unavailable="true" />'
  )
  lines.push(`</${BLOCK_TAG}>`)
  return lines.join('\n')
}
