import type { Emitter, HLJSOptions } from 'highlight.js'

export type MobileSyntaxNode = {
  type: 'element' | 'text'
  value?: string
  properties?: {
    className?: string[]
  }
  children?: MobileSyntaxNode[]
}

type MobileSyntaxParent = {
  children: MobileSyntaxNode[]
}

export class MobileSyntaxEmitter implements Emitter {
  readonly root: MobileSyntaxParent = { children: [] }
  private readonly classPrefix: string
  private readonly stack: MobileSyntaxParent[] = [this.root]

  constructor(options: HLJSOptions) {
    this.classPrefix = options.classPrefix
  }

  addText(value: string): void {
    if (value.length === 0) {
      return
    }
    const current = this.currentParent()
    const tail = current.children.at(-1)
    if (tail?.type === 'text') {
      tail.value = `${tail.value ?? ''}${value}`
      return
    }
    current.children.push({ type: 'text', value })
  }

  startScope(rawName: string): void {
    const className = rawName
      .split('.')
      .map((name, index) =>
        index === 0 ? `${this.classPrefix}${name}` : `${name}${'_'.repeat(index)}`
      )
    const child: MobileSyntaxNode & MobileSyntaxParent = {
      type: 'element',
      properties: { className },
      children: []
    }
    this.currentParent().children.push(child)
    this.stack.push(child)
  }

  // Why: Highlight.js' parser still calls these private TokenTree methods for
  // mode scopes even though its exported Emitter type only lists start/endScope.
  openNode(rawName: string): void {
    this.startScope(rawName)
  }

  endScope(): void {
    if (this.stack.length > 1) {
      this.stack.pop()
    }
  }

  closeNode(): void {
    this.endScope()
  }

  __addSublanguage(emitter: Emitter, name: string): void {
    if (!(emitter instanceof MobileSyntaxEmitter)) {
      return
    }
    if (name.length === 0) {
      this.currentParent().children.push(...emitter.root.children)
      return
    }
    this.currentParent().children.push({
      type: 'element',
      properties: { className: [name] },
      children: emitter.root.children
    })
  }

  finalize(): void {
    this.stack.splice(1)
  }

  toHTML(): string {
    return ''
  }

  private currentParent(): MobileSyntaxParent {
    const current = this.stack.at(-1)
    if (!current) {
      throw new Error('mobile_syntax_emitter_stack_empty')
    }
    return current
  }
}
