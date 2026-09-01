import { requestBrowserPermissions } from './permission'

export type PickedElementContext = {
  column: number | null
  componentName: string | null
  computedStyles: Record<string, string>
  line: number | null
  outerHtml: string
  pageUrl: string
  selector: string
  sourceFile: string | null
  tagName: string
  text: string
}

export async function pickPageElement(): Promise<PickedElementContext | null> {
  const granted = await requestBrowserPermissions({
    permissions: ['activeTab', 'scripting']
  })
  if (!granted) {
    throw new Error('element_picker_permission_denied')
  }
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  const tabId = tabs[0]?.id
  if (tabId === undefined) {
    throw new Error('active_tab_missing')
  }
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () =>
      new Promise<unknown>((resolve) => {
        let hovered: HTMLElement | null = null
        const previousCursor = document.documentElement.style.cursor
        const clearHovered = (): void => {
          if (hovered) {
            hovered.style.removeProperty('outline')
            hovered.style.removeProperty('outline-offset')
          }
          hovered = null
        }
        const finish = (value: unknown): void => {
          clearHovered()
          document.documentElement.style.cursor = previousCursor
          document.removeEventListener('mouseover', onHover, true)
          document.removeEventListener('click', onClick, true)
          document.removeEventListener('keydown', onKeyDown, true)
          resolve(value)
        }
        const onHover = (event: MouseEvent): void => {
          clearHovered()
          if (event.target instanceof HTMLElement) {
            hovered = event.target
            hovered.style.setProperty('outline', '2px solid #7c3aed', 'important')
            hovered.style.setProperty('outline-offset', '2px', 'important')
          }
        }
        const onClick = (event: MouseEvent): void => {
          event.preventDefault()
          event.stopImmediatePropagation()
          if (!(event.target instanceof HTMLElement)) {
            finish(null)
            return
          }
          const element = event.target
          const style = getComputedStyle(element)
          const evidence = reactEvidence(element)
          finish({
            column: evidence.column,
            componentName: evidence.componentName,
            computedStyles: Object.fromEntries(
              [
                'background-color',
                'color',
                'display',
                'font',
                'height',
                'margin',
                'padding',
                'position',
                'width'
              ].map((name) => [name, style.getPropertyValue(name)])
            ),
            line: evidence.line,
            outerHtml: element.outerHTML.slice(0, 12_000),
            pageUrl: location.href,
            selector: elementSelector(element),
            sourceFile: evidence.sourceFile,
            tagName: element.tagName.toLowerCase(),
            text: element.innerText.slice(0, 4_000)
          })
        }
        const reactEvidence = (
          element: HTMLElement
        ): {
          column: number | null
          componentName: string | null
          line: number | null
          sourceFile: string | null
        } => {
          const explicitSource = element.dataset.source ?? null
          const explicitComponent = element.dataset.component ?? null
          const fiberKey = Reflect.ownKeys(element).find(
            (key) =>
              typeof key === 'string' &&
              (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'))
          )
          let fiber: unknown = fiberKey ? Reflect.get(element, fiberKey) : null
          for (
            let depth = 0;
            depth < 50 && typeof fiber === 'object' && fiber !== null;
            depth += 1
          ) {
            const source = Reflect.get(fiber, '_debugSource')
            const type = Reflect.get(fiber, 'type')
            const componentName =
              explicitComponent ??
              (typeof type === 'function' || (typeof type === 'object' && type !== null)
                ? (stringProperty(type, 'displayName') ?? stringProperty(type, 'name'))
                : typeof type === 'string'
                  ? type
                  : null)
            const sourceFile =
              explicitSource ??
              (typeof source === 'object' && source !== null
                ? stringProperty(source, 'fileName')
                : null)
            if (componentName || sourceFile) {
              return {
                column:
                  typeof source === 'object' && source !== null
                    ? numberProperty(source, 'columnNumber')
                    : null,
                componentName,
                line:
                  typeof source === 'object' && source !== null
                    ? numberProperty(source, 'lineNumber')
                    : null,
                sourceFile
              }
            }
            fiber = Reflect.get(fiber, 'return')
          }
          return {
            column: null,
            componentName: explicitComponent,
            line: null,
            sourceFile: explicitSource
          }
        }
        const stringProperty = (value: object, key: string): string | null => {
          const property = Reflect.get(value, key)
          return typeof property === 'string' && property.trim() ? property : null
        }
        const numberProperty = (value: object, key: string): number | null => {
          const property = Reflect.get(value, key)
          return typeof property === 'number' && Number.isInteger(property) && property > 0
            ? property
            : null
        }
        const onKeyDown = (event: KeyboardEvent): void => {
          if (event.key === 'Escape') {
            event.preventDefault()
            finish(null)
          }
        }
        const elementSelector = (element: HTMLElement): string => {
          if (element.id) {
            return `#${CSS.escape(element.id)}`
          }
          const parts: string[] = []
          for (
            let current: HTMLElement | null = element;
            current && current !== document.body;
            current = current.parentElement
          ) {
            const tag = current.tagName.toLowerCase()
            const siblings = current.parentElement
              ? [...current.parentElement.children].filter(
                  (child) => child.tagName === current?.tagName
                )
              : []
            const suffix =
              siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : ''
            parts.unshift(`${tag}${suffix}`)
          }
          return `body > ${parts.join(' > ')}`
        }
        document.documentElement.style.cursor = 'crosshair'
        document.addEventListener('mouseover', onHover, true)
        document.addEventListener('click', onClick, true)
        document.addEventListener('keydown', onKeyDown, true)
      })
  })
  return parsePickedElement(results[0]?.result)
}

function parsePickedElement(value: unknown): PickedElementContext | null {
  if (value === null) {
    return null
  }
  if (
    typeof value !== 'object' ||
    typeof Reflect.get(value, 'outerHtml') !== 'string' ||
    typeof Reflect.get(value, 'pageUrl') !== 'string' ||
    typeof Reflect.get(value, 'selector') !== 'string' ||
    typeof Reflect.get(value, 'tagName') !== 'string' ||
    typeof Reflect.get(value, 'text') !== 'string'
  ) {
    throw new Error('element_picker_result_invalid')
  }
  const computedStyles = Reflect.get(value, 'computedStyles')
  if (typeof computedStyles !== 'object' || computedStyles === null) {
    throw new Error('element_picker_result_invalid')
  }
  return {
    column: nullablePositiveInteger(Reflect.get(value, 'column')),
    componentName: nullableString(Reflect.get(value, 'componentName')),
    computedStyles: Object.fromEntries(
      Object.entries(computedStyles).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    ),
    line: nullablePositiveInteger(Reflect.get(value, 'line')),
    outerHtml: Reflect.get(value, 'outerHtml'),
    pageUrl: Reflect.get(value, 'pageUrl'),
    selector: Reflect.get(value, 'selector'),
    sourceFile: nullableString(Reflect.get(value, 'sourceFile')),
    tagName: Reflect.get(value, 'tagName'),
    text: Reflect.get(value, 'text')
  }
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function nullablePositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}
