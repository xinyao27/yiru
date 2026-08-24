export function removeMermaidErrorNode(renderId: string): void {
  document.getElementById(`d${renderId}`)?.remove()
}
