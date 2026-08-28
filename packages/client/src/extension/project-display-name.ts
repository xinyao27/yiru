type ProjectNameSource = {
  displayName: string
  id: string
}

export function projectDisplayName(
  projects: readonly ProjectNameSource[],
  projectId: string,
  fallback: string
): string {
  return projects.find((project) => project.id === projectId)?.displayName ?? fallback
}
