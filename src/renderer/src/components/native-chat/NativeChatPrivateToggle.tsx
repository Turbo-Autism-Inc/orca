import { useEffect } from 'react'
import { EyeOff } from 'lucide-react'
import { Toggle } from '@/components/ui/toggle'
import { translate } from '@/i18n/i18n'
import {
  setPrivateChatMode,
  syncPrivateChatModeFromMain,
  usePrivateChatMode
} from '@/lib/private-chat-mode'

/** Top-right switch: chats started while on keep their messages in memory only. */
export function NativeChatPrivateToggle(): React.JSX.Element {
  const on = usePrivateChatMode()
  useEffect(() => {
    syncPrivateChatModeFromMain()
  }, [])
  const label = translate('components.native-chat.privateChat', 'Private chat')
  return (
    <div className="absolute right-2 top-2 z-10">
      <Toggle
        size="sm"
        pressed={on}
        aria-label={label}
        title={translate(
          'components.native-chat.privateChatHint',
          'New chats keep their messages in memory only: nothing is saved to disk, drafts are not kept, and nothing is sent to telemetry.'
        )}
        onPressedChange={(pressed) => void setPrivateChatMode(pressed)}
        className="gap-1 text-xs"
      >
        <EyeOff className="size-3.5" />
        {label}
      </Toggle>
    </div>
  )
}
