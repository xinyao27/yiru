import { translate } from '../../i18n/translate'
import { readBundledSkillGuides, type BundledSkillGuide } from '../../skills/resources'
import { hasFlag } from '../arguments'
import { writeCliOutput } from '../output'

export async function runSkillsCommand(args: string[]): Promise<void> {
  const [command, topic] = args
  const guides = (await readBundledSkillGuides()).toSorted((left, right) =>
    left.name.localeCompare(right.name, 'en')
  )
  switch (command) {
    case 'list': {
      const topics = guides.map((guide) => ({
        name: guide.name,
        description: guide.description.replace(/\s+/g, ' ').trim()
      }))
      writeCliOutput(
        { topics },
        hasFlag(args, '--json'),
        topics.map((entry) => `${entry.name}: ${entry.description}`).join('\n')
      )
      return
    }
    case 'get': {
      const guide = findGuide(guides, topic)
      const full = hasFlag(args, '--full')
      const markdown = full ? guide.fullMarkdown : guide.markdown
      writeCliOutput({ name: guide.name, full, markdown }, hasFlag(args, '--json'), markdown)
      return
    }
    default:
      throw new Error('cli_command_unsupported:skills')
  }
}

function findGuide(
  guides: readonly BundledSkillGuide[],
  topic: string | undefined
): BundledSkillGuide {
  if (!topic || topic.startsWith('--')) {
    throw new Error(translate('A skill name is required'))
  }
  const guide = guides.find((candidate) => [candidate.name, ...candidate.aliases].includes(topic))
  if (!guide) {
    throw new Error(
      translate('Unknown skill {{name}}. Available skills: {{skills}}', {
        name: topic,
        skills: guides.map((candidate) => candidate.name).join(', ')
      })
    )
  }
  return guide
}
