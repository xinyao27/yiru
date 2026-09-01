export function waitForBrowserCondition(payload: {
  fn: string | null
  selector: string | null
  state: string | null
  text: string | null
  timeout: number
  url: string | null
}): Promise<boolean> {
  const startedAt = Date.now()
  return new Promise((resolve, reject) => {
    const check = (): void => {
      try {
        const element = payload.selector ? document.querySelector(payload.selector) : null
        const matches =
          (payload.selector === null ||
            (payload.state === 'hidden' ? !element : Boolean(element))) &&
          (payload.text === null || document.body.innerText.includes(payload.text)) &&
          (payload.url === null || location.href.includes(payload.url)) &&
          (payload.fn === null || Boolean(Function(`return (${payload.fn})`)()))
        if (matches) {
          resolve(true)
          return
        }
        if (Date.now() - startedAt >= payload.timeout) {
          reject(new Error('browser_wait_timeout'))
          return
        }
        setTimeout(check, 100)
      } catch (error) {
        reject(error)
      }
    }
    check()
  })
}

export function readPageValue(payload: { selector: string | null; what: string }): unknown {
  const element = payload.selector
    ? document.querySelector(payload.selector)
    : document.documentElement
  if (!element) {
    throw new Error('browser_element_not_found')
  }
  switch (payload.what) {
    case 'text':
      return element.textContent ?? ''
    case 'html':
      return element instanceof HTMLElement ? element.innerHTML : ''
    case 'value':
      return 'value' in element ? Reflect.get(element, 'value') : null
    case 'url':
      return location.href
    case 'title':
      return document.title
    default:
      return element.getAttribute(payload.what)
  }
}

export function readPageState(payload: { selector: string; what: string }): boolean {
  const element = document.querySelector(payload.selector)
  if (!(element instanceof HTMLElement)) {
    return false
  }
  const style = getComputedStyle(element)
  switch (payload.what) {
    case 'visible':
      return style.display !== 'none' && style.visibility !== 'hidden'
    case 'enabled':
      return !element.hasAttribute('disabled')
    case 'checked':
      return element instanceof HTMLInputElement && element.checked
    case 'editable':
      return (
        element.isContentEditable ||
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement
      )
    default:
      return false
  }
}

export function findPageElement(payload: {
  action: string
  locator: string
  text: string | null
  value: string
}): unknown {
  const elements = Array.from(document.querySelectorAll('*'))
  const target = elements.find((element) => {
    if (payload.locator === 'text') {
      return element.textContent?.trim() === payload.value
    }
    if (payload.locator === 'role') {
      return element.getAttribute('role') === payload.value
    }
    if (payload.locator === 'testid') {
      return element.getAttribute('data-testid') === payload.value
    }
    if (payload.locator === 'placeholder') {
      return element.getAttribute('placeholder') === payload.value
    }
    if (payload.locator === 'label') {
      return element.getAttribute('aria-label') === payload.value
    }
    return false
  })
  if (!(target instanceof HTMLElement)) {
    throw new Error('browser_element_not_found')
  }
  if (payload.action === 'click') {
    target.click()
  }
  if (
    payload.action === 'fill' &&
    (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
  ) {
    target.value = payload.text ?? ''
    target.dispatchEvent(new Event('input', { bubbles: true }))
  }
  return { action: payload.action, found: true }
}

export function highlightPageElement(selector: string): boolean {
  const element = document.querySelector(selector)
  if (!(element instanceof HTMLElement)) {
    throw new Error('browser_element_not_found')
  }
  element.animate([{ outline: '3px solid #7c3aed' }, { outline: '3px solid transparent' }], {
    duration: 1_200,
    iterations: 2
  })
  element.scrollIntoView({ block: 'center', inline: 'center' })
  return true
}
