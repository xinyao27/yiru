import type { MobileStatusToken } from './pr-checks-presentation'

export type StatusColorClasses = {
  accent: string
  background: string
  border: string
  text: string
}

// Keeps pure presentation logic independent from Uniwind while ordinary state
// colors stay on Tailwind's built-in palette, as required by the style guide.
export function statusColorClasses(token: MobileStatusToken): StatusColorClasses {
  switch (token) {
    case 'statusGreen':
      return {
        accent: 'accent-green-500',
        background: 'bg-green-500',
        border: 'border-green-500',
        text: 'text-green-500'
      }
    case 'statusAmber':
      return {
        accent: 'accent-amber-500',
        background: 'bg-amber-500',
        border: 'border-amber-500',
        text: 'text-amber-500'
      }
    case 'statusRed':
      return {
        accent: 'accent-red-500',
        background: 'bg-red-500',
        border: 'border-red-500',
        text: 'text-red-500'
      }
    case 'statusPurple':
      return {
        accent: 'accent-violet-400',
        background: 'bg-violet-400',
        border: 'border-violet-400',
        text: 'text-violet-400'
      }
    default:
      return {
        accent: 'accent-muted-foreground',
        background: 'bg-muted-foreground',
        border: 'border-muted-foreground',
        text: 'text-muted-foreground'
      }
  }
}
