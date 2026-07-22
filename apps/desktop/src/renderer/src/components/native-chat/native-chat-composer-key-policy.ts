export type NativeChatComposerKeyPolicyEvent = {
  key: string
  shiftKey: boolean
  nativeEvent?: {
    isComposing?: boolean
    keyCode?: number
  }
}

export function isNativeChatComposerComposing(event: NativeChatComposerKeyPolicyEvent): boolean {
  return event.nativeEvent?.isComposing === true || event.nativeEvent?.keyCode === 229
}

export function shouldSubmitNativeChatComposer(event: NativeChatComposerKeyPolicyEvent): boolean {
  return event.key === 'Enter' && !event.shiftKey && !isNativeChatComposerComposing(event)
}
