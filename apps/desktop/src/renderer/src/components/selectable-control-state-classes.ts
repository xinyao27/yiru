export function getSelectableControlStateClasses(isActive: boolean): string {
  return isActive
    ? 'bg-accent text-accent-foreground'
    : 'bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-within:bg-accent focus-within:text-accent-foreground'
}
