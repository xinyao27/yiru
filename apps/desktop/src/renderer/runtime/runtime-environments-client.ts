// Why: runtime-environment selection is the transport switchboard itself, so
// it remains an adapter boundary instead of being folded into runtimeContract.
// Resolve members lazily because the web entry installs its adapter only after
// static renderer modules have evaluated.
export const runtimeEnvironmentsClient: Window['api']['runtimeEnvironments'] = {
  get list() {
    return window.api.runtimeEnvironments.list
  },
  get resolve() {
    return window.api.runtimeEnvironments.resolve
  },
  get remove() {
    return window.api.runtimeEnvironments.remove
  },
  get disconnect() {
    return window.api.runtimeEnvironments.disconnect
  },
  get getStatus() {
    return window.api.runtimeEnvironments.getStatus
  },
  get call() {
    return window.api.runtimeEnvironments.call
  },
  get subscribe() {
    return window.api.runtimeEnvironments.subscribe
  },
  get callOrpcProcedure() {
    return window.api.runtimeEnvironments.callOrpcProcedure
  }
}
