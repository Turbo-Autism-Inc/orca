import { useCallback, useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ImeTextarea } from '@/lib/ime-text-field'
import { translate } from '@/i18n/i18n'
import type { HermesGatewayStatus } from '../../../shared/hermes-gateway-types'

export const OPEN_HERMES_ANYWHERE_EVENT = 'orca:open-hermes-anywhere'

type Turn = { role: 'user' | 'assistant' | 'error'; text: string }

/** Mod+Alt+H, from any pane; checked on the event, so a TUI keeps every other chord. */
export function isHermesAnywhereShortcut(
  event: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'code'>,
  isMac: boolean
): boolean {
  const mod = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
  return mod && event.altKey && !event.shiftKey && event.code === 'KeyH'
}

/** A Hermes conversation reachable from any pane, sent through main's local gateway. */
export function HermesAnywhereDialog(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<HermesGatewayStatus | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const conversationId = useRef(`hermes-anywhere-${crypto.randomUUID()}`)

  useEffect(() => {
    const isMac = navigator.userAgent.includes('Mac')
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isHermesAnywhereShortcut(event, isMac)) {
        event.preventDefault()
        setOpen(true)
      }
    }
    const onOpen = (): void => setOpen(true)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener(OPEN_HERMES_ANYWHERE_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener(OPEN_HERMES_ANYWHERE_EVENT, onOpen)
    }
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }
    let live = true
    void window.api.hermesGateway?.status().then((next) => live && setStatus(next))
    return () => {
      live = false
    }
  }, [open])

  const send = useCallback(async () => {
    const text = draft.trim()
    if (!text || sending) {
      return
    }
    setDraft('')
    setSending(true)
    setTurns((current) => [...current, { role: 'user', text }])
    const result = await window.api.hermesGateway.send({
      conversationId: conversationId.current,
      text
    })
    setTurns((current) => [
      ...current,
      result.ok ? { role: 'assistant', text: result.text } : { role: 'error', text: result.error }
    ])
    setSending(false)
  }, [draft, sending])

  const ready = status?.state === 'ready'
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{translate('components.hermesAnywhere.title', 'Hermes')}</DialogTitle>
          <DialogDescription>
            {ready
              ? translate(
                  'components.hermesAnywhere.ready',
                  'Connected to the local Hermes gateway at {{url}}.',
                  { url: status?.gatewayUrl ?? '' }
                )
              : translate(
                  'components.hermesAnywhere.notReady',
                  'Start the Hermes API server (API_SERVER_ENABLED and API_SERVER_KEY in ~/.hermes/.env) to chat here.'
                )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-80 min-h-24 flex-col gap-2 overflow-y-auto text-sm" aria-live="polite">
          {turns.map((turn, index) => (
            <p
              key={index}
              className={
                turn.role === 'user'
                  ? 'self-end whitespace-pre-wrap rounded-md bg-accent px-2 py-1'
                  : turn.role === 'error'
                    ? 'text-destructive'
                    : 'whitespace-pre-wrap'
              }
            >
              {turn.text}
            </p>
          ))}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void send()
          }}
        >
          <ImeTextarea
            rows={2}
            value={draft}
            disabled={!ready}
            aria-label={translate('components.hermesAnywhere.messageLabel', 'Message Hermes')}
            className="min-w-0 flex-1 resize-none rounded-md border border-input bg-transparent px-2 py-1 text-sm focus-visible:outline-none"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                void send()
              }
            }}
          />
          <Button type="submit" size="sm" disabled={!ready || sending || draft.trim() === ''}>
            {translate('components.hermesAnywhere.send', 'Send')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
