import type { RepoIcon } from '@yiru/workbench-model/workspace'
import { Image, Text, View } from 'react-native'

import {
  Robot as Bot,
  Cube as Box,
  BracketsCurly as Braces,
  Briefcase,
  Buildings as Building2,
  CodeSimple as Code2,
  Cpu,
  Database,
  Folder,
  Gauge,
  Globe,
  Stack as Layers,
  type Icon,
  Package,
  Palette,
  Rocket,
  HardDrives as Server,
  Shapes,
  Sparkle as Sparkles,
  TerminalWindow as SquareTerminal,
  Wrench
} from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { useThemeColors } from '../theme/uniwind-theme-values'

// The desktop payload keeps historical icon names; map them to Phosphor so
// mobile and desktop still render the same project concept.
const REPO_PHOSPHOR_ICONS: Record<string, Icon> = {
  Folder,
  Code2,
  SquareTerminal,
  Bot,
  Package,
  Database,
  Globe,
  Server,
  Layers,
  Box,
  Braces,
  Briefcase,
  Building2,
  Cpu,
  Gauge,
  Palette,
  Rocket,
  Shapes,
  Sparkles,
  Wrench
}

type Props = {
  repoIcon?: RepoIcon | null
  size?: number
  color?: string
}

// Renders a repo/project icon matching the desktop sidebar: a custom image
// (favicon/avatar/upload), an emoji, or a Phosphor glyph. Falls back to Folder,
// the desktop default, so a project always shows an icon rather than a dot.
export function MobileRepoIcon({ repoIcon, size = 14, color }: Props) {
  const colors = useThemeColors()
  const resolvedColor = color ?? colors.textSecondary
  if (repoIcon?.type === 'image') {
    return (
      <Image
        source={{ uri: repoIcon.src }}
        className="rounded-none"
        style={{ width: size, height: size }}
        accessibilityLabel={repoIcon.label}
      />
    )
  }
  if (repoIcon?.type === 'emoji') {
    return (
      <Text className={styles.emoji} style={[{ fontSize: size }]}>
        {repoIcon.emoji}
      </Text>
    )
  }
  // Why: `lucide` is a persisted cross-client discriminator, not a runtime dependency.
  const Icon = (repoIcon?.type === 'lucide' && REPO_PHOSPHOR_ICONS[repoIcon.name]) || Folder
  return (
    <View className={styles.glyph}>
      <Icon size={size} color={resolvedColor} />
    </View>
  )
}

const styles = {
  emoji: cn('text-center'),
  glyph: cn('items-center justify-center')
} as const
