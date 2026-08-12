import { z } from 'zod'
import type { GlobalSettings } from '~shared/types'

import { createCollectionSettingSchemas } from './settings-collection-schema'
import { createFeatureSettingSchemas } from './settings-feature-schema'
import { createScalarSettingSchemas } from './settings-scalar-schema'

type GlobalSettingsSchemaShape = {
  [Key in keyof GlobalSettings]-?: z.ZodType<GlobalSettings[Key]>
}

export function decodeStoredWebSettings(
  defaults: GlobalSettings,
  stored: Record<string, unknown>
): GlobalSettings {
  const shape = {
    ...createScalarSettingSchemas(defaults),
    ...createCollectionSettingSchemas(defaults),
    ...createFeatureSettingSchemas(defaults)
  } satisfies GlobalSettingsSchemaShape
  const schema = z.object(shape)
  return schema.parse({ ...defaults, ...stored })
}
