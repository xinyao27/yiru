import { translate } from '~renderer/i18n/i18n'
import { createLocalizedCatalog } from '~renderer/i18n/localized-catalog'

import { translateSearchKeyword } from '../search-keywords'

export const getThemeColorEntries = createLocalizedCatalog(() => [
  {
    title: translate('themeGradient.search.paletteTitle', 'Theme color'),
    description: translate(
      'themeGradient.search.paletteDescription',
      'Pick an accent color and background wash for a workspace.'
    ),
    keywords: [
      ...translateSearchKeyword('themeGradient.search.keywordColor', 'color'),
      ...translateSearchKeyword('themeGradient.search.keywordAccent', 'accent'),
      ...translateSearchKeyword('themeGradient.search.keywordPalette', 'palette'),
      ...translateSearchKeyword('themeGradient.search.keywordGradient', 'gradient')
    ]
  },
  {
    title: translate('themeGradient.search.grainTitle', 'Grain'),
    description: translate(
      'themeGradient.search.grainDescription',
      'Film-grain texture layered over the workspace theme gradient.'
    ),
    keywords: [
      ...translateSearchKeyword('themeGradient.search.keywordTexture', 'texture'),
      ...translateSearchKeyword('themeGradient.search.keywordNoise', 'noise')
    ]
  }
])
