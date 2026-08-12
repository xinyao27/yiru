# `@yiru/shared`

`@yiru/shared` owns pure cross-process logic and shared types, including the loopback bootstrap and
native file-drop payload contracts. Its source must not import desktop, client, or Electron
modules, and internal imports are always relative so the package never depends on a host alias
resolver.

The `./*` export maps public subpaths to TypeScript source for typechecking, browser, and development
consumers, and to built ESM/CJS files for runtime consumers. The desktop CLI build copies the CJS
distribution beside its emitted output so plain Node can resolve the same public subpaths.
