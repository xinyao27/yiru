import { ARM_SCRIPT } from './grab-guest-arm-script'

type GuestScriptAction = 'arm' | 'awaitClick' | 'finalize' | 'extractHover' | 'teardown'

/**
 * Build a self-contained JS script for the given grab lifecycle action.
 *
 * - `arm`: install the shadow-root overlay, hover listeners, and extraction logic
 * - `awaitClick`: return a Promise that resolves with the payload when the user clicks
 * - `finalize`: extract the payload for the currently hovered element and return it
 * - `extractHover`: extract the payload for the currently hovered element WITHOUT cleanup
 * - `teardown`: remove the overlay and all listeners
 */
export function buildGuestOverlayScript(action: GuestScriptAction): string {
  switch (action) {
    case 'arm':
      return ARM_SCRIPT
    case 'awaitClick':
      return AWAIT_CLICK_SCRIPT
    case 'finalize':
      return FINALIZE_SCRIPT
    case 'extractHover':
      return EXTRACT_HOVER_SCRIPT
    case 'teardown':
      return TEARDOWN_SCRIPT
  }
}

const AWAIT_CLICK_SCRIPT = `new Promise(function(resolve, reject) {
  'use strict';
  var grab = window.__yiruGrab;
  if (!grab) {
    reject(new Error('Grab not armed'));
    return;
  }

  function extractSelectedPayload(el) {
    try {
      return grab.extractPayload(el);
    } catch (error) {
      grab.cleanup();
      reject(error instanceof Error ? error : new Error('Failed to extract element context'));
      return null;
    }
  }

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    grab.host.removeEventListener('click', onClick, true);
    grab.host.removeEventListener('contextmenu', onContext, true);
    var el = grab.getCurrentElement();
    if (!el) {
      grab.cleanup();
      reject(new Error('cancelled'));
      return;
    }
    var payload = extractSelectedPayload(el);
    if (!payload) return;
    // Why: freeze the highlight instead of removing it so the user sees
    // which element was selected while the copy menu is shown. Teardown
    // happens later when the renderer calls setGrabMode(false) or re-arms.
    grab.freezeHighlight();
    resolve(payload);
  }

  function onContext(e) {
    // Why: right-click resolves with the payload wrapped in a context-menu
    // marker so the renderer can show the full action dropdown instead of
    // auto-copying. This gives users a deliberate path to screenshot and
    // other secondary actions while keeping left-click as the fast copy path.
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    grab.host.removeEventListener('click', onClick, true);
    grab.host.removeEventListener('contextmenu', onContext, true);
    var el = grab.getCurrentElement();
    if (!el) {
      grab.cleanup();
      reject(new Error('cancelled'));
      return;
    }
    var payload = extractSelectedPayload(el);
    if (!payload) return;
    grab.freezeHighlight();
    resolve({ __yiruContextMenu: true, payload: payload });
  }

  grab.host.addEventListener('click', onClick, true);
  grab.host.addEventListener('contextmenu', onContext, true);

  // Store cancel hook so teardown can settle the Promise
  grab.cancelAwait = function() {
    grab.host.removeEventListener('click', onClick, true);
    grab.host.removeEventListener('contextmenu', onContext, true);
    grab.cleanup();
    // Why: teardown cancellation is a normal user flow; resolving a marker
    // avoids a noisy guest-console Error while main still treats it as cancel.
    resolve({ __yiruCancelled: true });
  };
})`

// ---------------------------------------------------------------------------
// The finalize script extracts the payload for the currently hovered element.
// ---------------------------------------------------------------------------
const FINALIZE_SCRIPT = `(function() {
  'use strict';
  var grab = window.__yiruGrab;
  if (!grab) return null;
  var el = grab.getCurrentElement();
  if (!el) return null;
  var payload = null;
  try {
    payload = grab.extractPayload(el);
  } catch (e) {
    grab.cleanup();
    return null;
  }
  grab.cleanup();
  return payload;
})()`

// ---------------------------------------------------------------------------
// The extractHover script reads the payload for the currently hovered element
// WITHOUT cleaning up. The overlay and awaitClick listener stay active so the
// user can continue picking elements. Used by keyboard shortcuts (C/S) that
// copy the hovered element without requiring a click first.
// ---------------------------------------------------------------------------
const EXTRACT_HOVER_SCRIPT = `(function() {
  'use strict';
  var grab = window.__yiruGrab;
  if (!grab) return null;
  var el = grab.getCurrentElement();
  if (!el) return null;
  try {
    return grab.extractPayload(el);
  } catch (e) {
    return null;
  }
})()`

// ---------------------------------------------------------------------------
// The teardown script removes the overlay and cleans up all state.
// ---------------------------------------------------------------------------
const TEARDOWN_SCRIPT = `(function() {
  'use strict';
  var grab = window.__yiruGrab;
  if (!grab) return true;
  // If there's an active awaitClick Promise, cancel it so the
  // executeJavaScript call in main rejects and settles the grab op.
  if (grab.cancelAwait) {
    grab.cancelAwait();
  } else {
    grab.cleanup();
  }
  return true;
})()`
