// Why: Chromium scopes sessionStorage to a disposable browsing context. Mirror
// each Yiru page under a stable id so closed and restored pages keep site state.
export const YIRU_PERSIST_SESSION_STORAGE_EXPRESSION = `window.__yiruPersistSessionStorage?.()`

export function buildSessionStoragePersistenceScript(
  browserPageId: string,
  shouldRestore = true
): string {
  const encodedPageId = JSON.stringify(browserPageId)
  const encodedShouldRestore = JSON.stringify(shouldRestore)
  return `(function() {
  var browserPageId = ${encodedPageId};
  var shouldRestore = ${encodedShouldRestore};
  var snapshotPrefix = '__yiru_internal_session_storage_v1__:';
  var snapshotKey = snapshotPrefix + browserPageId;
  var installedPageIdKey = '__yiruSessionStoragePersistencePageId';
  var local;
  var session;
  var lastSnapshot = null;

  if (window[installedPageIdKey] === browserPageId) {
    return;
  }

  try {
    local = window.localStorage;
    session = window.sessionStorage;
  } catch {
    return;
  }

  var readSnapshot = function() {
    return local.getItem(snapshotKey);
  };

  var restore = function() {
    if (session.length !== 0) {
      return;
    }
    var serialized = readSnapshot();
    if (!serialized) {
      return;
    }
    try {
      var entries = JSON.parse(serialized);
      if (!Array.isArray(entries)) {
        return;
      }
      for (var entry of entries) {
        if (
          Array.isArray(entry) &&
          entry.length === 2 &&
          typeof entry[0] === 'string' &&
          typeof entry[1] === 'string'
        ) {
          session.setItem(entry[0], entry[1]);
        }
      }
    } catch {}
  };

  var serialize = function() {
    var entries = [];
    for (var index = 0; index < session.length; index += 1) {
      var key = session.key(index);
      if (key !== null) {
        entries.push([key, session.getItem(key) || '']);
      }
    }
    entries.sort(function(left, right) {
      return left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0;
    });
    return JSON.stringify(entries);
  };

  var persist = function() {
    try {
      var serialized = serialize();
      if (serialized === lastSnapshot) {
        return;
      }
      if (session.length === 0) {
        local.removeItem(snapshotKey);
      } else {
        local.setItem(snapshotKey, serialized);
      }
      lastSnapshot = serialized;
    } catch {}
  };

  if (shouldRestore) restore();
  persist();
  try {
    var originalSetItem = session.setItem;
    var originalRemoveItem = session.removeItem;
    var originalClear = session.clear;
    Object.defineProperties(session, {
      setItem: {
        configurable: true,
        value: function setItem(key, value) {
          var result = originalSetItem.call(this, key, value);
          if (this === session) persist();
          return result;
        },
        writable: true
      },
      removeItem: {
        configurable: true,
        value: function removeItem(key) {
          var result = originalRemoveItem.call(this, key);
          if (this === session) persist();
          return result;
        },
        writable: true
      },
      clear: {
        configurable: true,
        value: function clear() {
          var result = originalClear.call(this);
          if (this === session) persist();
          return result;
        },
        writable: true
      }
    });
    Object.defineProperty(window, '__yiruPersistSessionStorage', {
      configurable: true,
      value: persist
    });
    Object.defineProperty(window, installedPageIdKey, {
      configurable: true,
      value: browserPageId
    });
  } catch {}
  window.addEventListener('pagehide', persist, { capture: true });
  window.addEventListener('beforeunload', persist, { capture: true });
  document.addEventListener('visibilitychange', persist, { capture: true });
  setInterval(persist, 250);
})()`
}
