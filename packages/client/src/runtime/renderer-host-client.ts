// Why: feature modules depend on the renderer host adapter, not the preload
// implementation. The web entry installs Window.api after startup modules load,
// so property lookup must stay live instead of capturing the initial undefined value.
const rendererHostClientTarget = {} as Window['api']

export const rendererHostClient: Window['api'] = new Proxy(rendererHostClientTarget, {
  get: (_target, property, receiver) => {
    const client = window.api
    return client ? Reflect.get(client, property, receiver) : undefined
  }
})
