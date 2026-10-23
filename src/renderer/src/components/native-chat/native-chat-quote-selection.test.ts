import { describe, expect, it } from 'vitest'
import { formatNativeChatQuoteFollowUp } from './native-chat-quote-selection'

describe('formatNativeChatQuoteFollowUp', () => {
  it('names the source message, quotes the span verbatim, then the note', () => {
    expect(
      formatNativeChatQuoteFollowUp({
        quote: '  const x = 1\n\n  return x  ',
        note: '  Why not inline it?  ',
        messageId: 'assistant-42'
      })
    ).toBe('Re: agent message assistant-42\n> const x = 1\n>\n>   return x\n\nWhy not inline it?')
  })

  it('omits the reference when the reply has no id', () => {
    expect(formatNativeChatQuoteFollowUp({ quote: 'a', note: 'b', messageId: null })).toBe(
      '> a\n\nb'
    )
  })
})
