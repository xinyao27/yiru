export class SessionInventoryOpeningRegistry {
  private readonly controllersByBinding = new Map<string, Set<AbortController>>()

  remember(bindingKey: string, controller: AbortController): void {
    const controllers = this.controllersByBinding.get(bindingKey) ?? new Set()
    controllers.add(controller)
    this.controllersByBinding.set(bindingKey, controllers)
  }

  forget(bindingKey: string, controller: AbortController): void {
    const controllers = this.controllersByBinding.get(bindingKey)
    controllers?.delete(controller)
    if (controllers?.size === 0) {
      this.controllersByBinding.delete(bindingKey)
    }
  }

  abort(bindingKey: string): void {
    for (const controller of this.controllersByBinding.get(bindingKey) ?? []) {
      controller.abort()
    }
  }
}
