import type { BrowserGrabRect, BrowserGrabScreenshot } from '~shared/browser/grab-types'
import { GRAB_BUDGET } from '~shared/browser/grab-types'

import { captureScreenshot } from './cdp-screenshot'
import { evaluateBrowserPage } from './page/evaluation'
import type { BrowserPageHandle } from './page/handle'

const HIDE_BROWSER_GRAB_OVERLAY_SCRIPT = `(function(){
  var g = window.__yiruGrab;
  if (g && g.host) g.host.style.display = 'none';
  document.querySelectorAll('[data-yiru-browser-annotation-overlay]').forEach(function(el) {
    el.setAttribute('data-yiru-previous-display', el.style.display || '');
    el.style.display = 'none';
  });
})()`

const RESTORE_BROWSER_GRAB_OVERLAY_SCRIPT = `(function(){
  var g = window.__yiruGrab;
  if (g && g.host) g.host.style.display = '';
  document.querySelectorAll('[data-yiru-browser-annotation-overlay]').forEach(function(el) {
    el.style.display = el.getAttribute('data-yiru-previous-display') || '';
    el.removeAttribute('data-yiru-previous-display');
  });
})()`

function capturePageRect(page: BrowserPageHandle, rect: BrowserGrabRect): Promise<string> {
  const cdp = page.acquireCdp()
  return new Promise<string>((resolve, reject) => {
    captureScreenshot(
      page,
      cdp,
      {
        captureBeyondViewport: false,
        clip: { ...rect, scale: 1 },
        format: 'png'
      },
      (result) => {
        cdp.release()
        const data =
          result && typeof result === 'object'
            ? (result as Record<string, unknown>).data
            : undefined
        if (typeof data === 'string') {
          resolve(data)
        } else {
          reject(new Error('Screenshot returned no image data'))
        }
      },
      (message) => {
        cdp.release()
        reject(new Error(message))
      }
    )
  })
}

export async function captureSelectionScreenshot(
  rect: BrowserGrabRect,
  page: BrowserPageHandle
): Promise<BrowserGrabScreenshot | null> {
  if (
    ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return null
  }
  try {
    await evaluateBrowserPage(page, HIDE_BROWSER_GRAB_OVERLAY_SCRIPT).catch(() => undefined)
    let data: string
    try {
      data = await capturePageRect(page, rect)
    } finally {
      await evaluateBrowserPage(page, RESTORE_BROWSER_GRAB_OVERLAY_SCRIPT).catch(() => undefined)
    }
    if (Buffer.byteLength(data, 'base64') > GRAB_BUDGET.screenshotMaxBytes) {
      return null
    }
    return {
      dataUrl: `data:image/png;base64,${data}`,
      height: Math.round(rect.height),
      mimeType: 'image/png',
      width: Math.round(rect.width)
    }
  } catch {
    return null
  }
}
