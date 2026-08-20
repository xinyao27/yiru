# `@yiru/client`

`@yiru/client` is Yiru's source-only workbench UI, shared by the Electron renderer and browser
hosts. It deliberately has no JavaScript distribution build:

- Hosts already bundle its TypeScript and TSX source, avoiding a second compilation boundary.
- Wildcard exports cannot describe a tree containing TSX, CSS, fonts, workers, and `?url` assets.
- Vite must see the original asset imports and stylesheet graph to preserve their URL semantics.

## Public exports

| Export | Purpose |
| --- | --- |
| `@yiru/client/web-index.html` | HTML input for the browser workbench build |
| `@yiru/client/web-bootstrap` | Browser workbench React bootstrap |
| `@yiru/client/styles` | Global tokens and workbench chrome stylesheet |
| `@yiru/client/paraglide/messages` | Generated messages consumed outside the client bundle |
| `@yiru/client/vite` | Client root, aliases, React/Tailwind plugins, workers, and feature defines |

Consumers use only these exports; they never import `@yiru/client/src/*`. The package owns its
typecheck, lint, i18n generation, and UI policy gates. A client implementation change should not
require a desktop edit unless it also changes a host-facing runtime or shell contract.

## Host setup

```ts
import { createClientVitePreset } from '@yiru/client/vite'
import { defineConfig } from 'vite'

const client = createClientVitePreset({ featureWallEnabled: true })

export default defineConfig({
  ...client,
  build: { outDir: 'out/web' }
})
```

Hosts may extend the returned configuration for their output format, but client source resolution
and plugin ownership stay in the preset.
