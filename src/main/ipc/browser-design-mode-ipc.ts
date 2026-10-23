import { ipcMain } from 'electron'
import { saveDesignModeCapture } from '../browser/design-mode-capture-store'
import { getAppEnvironment } from '../../shared/app-environment'
import type { BrowserSaveDesignModeCaptureArgs } from '../../shared/browser-grab-types'
import { isTrustedBrowserRenderer } from './browser-renderer-trust'

export function registerBrowserDesignModeHandlers(): void {
  ipcMain.removeHandler('browser:designMode:saveCapture')
  ipcMain.handle(
    'browser:designMode:saveCapture',
    (event, args: BrowserSaveDesignModeCaptureArgs) =>
      isTrustedBrowserRenderer(event.sender)
        ? saveDesignModeCapture(getAppEnvironment().getPath('userData'), args)
        : { ok: false, reason: 'not-authorized' }
  )
}
