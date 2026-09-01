import type { RuntimeLayoutRecipe } from '@yiru/runtime-protocol/contract'
import { TUI_AGENT_IDS } from '@yiru/runtime-protocol/contract'
import { parse } from 'yaml'
import { z } from 'zod'

import type { Host } from '../hosts/contract'

const MAX_LAYOUT_PANES = 12
const MAX_LAYOUT_RECIPES = 20

const PaneSchema = z.discriminatedUnion('kind', [
  z.object({
    command: z.string().trim().min(1).max(16_384),
    kind: z.literal('command'),
    title: z.string().trim().min(1).max(128)
  }),
  z.object({
    agent: z.enum(TUI_AGENT_IDS),
    kind: z.literal('agent'),
    prompt: z.string().trim().min(1).max(128_000).optional(),
    title: z.string().trim().min(1).max(128)
  }),
  z.object({
    kind: z.literal('shell'),
    title: z.string().trim().min(1).max(128)
  })
])

const ConfigSchema = z.object({
  layouts: z
    .record(
      z.string().trim().min(1).max(128),
      z.object({ panes: z.array(PaneSchema).min(1).max(MAX_LAYOUT_PANES) })
    )
    .optional()
})

export async function readLayoutRecipes(
  worktreePath: string,
  host: Host
): Promise<RuntimeLayoutRecipe[]> {
  const text = await host.readText(host.join(worktreePath, 'yiru.yaml'), 1024 * 1024)
  if (text === null) {
    return []
  }
  const parsed = ConfigSchema.safeParse(parse(text))
  if (!parsed.success || !parsed.data.layouts) {
    return []
  }
  return Object.entries(parsed.data.layouts)
    .slice(0, MAX_LAYOUT_RECIPES)
    .map(([name, recipe]) => ({ name, panes: recipe.panes }))
}
