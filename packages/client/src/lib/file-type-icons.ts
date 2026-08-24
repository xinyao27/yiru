import {
  Database,
  File,
  FileArchive,
  Cube as FileAxis3D,
  FileCode as FileBraces,
  ChartBar as FileChartColumn,
  FileCode,
  FileText as FileCog,
  FileCode as FileDiff,
  FileImage,
  FileCode as FileJson,
  FileLock as FileKey,
  FileLock,
  FileAudio as FileMusic,
  SlidersHorizontal as FileSliders,
  FileXls as FileSpreadsheet,
  FileCode as FileTerminal,
  FileText,
  FileText as FileType,
  FileVideo,
  DeviceMobile as Smartphone,
  type Icon
} from '~renderer/components/icons/hugeicons'

import { FILE_ICON_BY_NAME } from './file-name-icon-catalog'

const FILE_ICON_BY_EXTENSION: Record<string, Icon> = {
  '7z': FileArchive,
  aac: FileMusic,
  adoc: FileText,
  ai: FileImage,
  asc: FileKey,
  astro: FileCode,
  avi: FileVideo,
  avif: FileImage,
  bash: FileTerminal,
  bat: FileTerminal,
  blend: FileAxis3D,
  bmp: FileImage,
  br: FileArchive,
  bz2: FileArchive,
  c: FileCode,
  cc: FileCode,
  cer: FileKey,
  cfg: FileSliders,
  cjs: FileCode,
  clj: FileCode,
  cmd: FileTerminal,
  conf: FileSliders,
  cpp: FileCode,
  crt: FileKey,
  cs: FileCode,
  css: FileType,
  csv: FileSpreadsheet,
  cts: FileCode,
  cxx: FileCode,
  dart: FileCode,
  db: Database,
  diff: FileDiff,
  dmg: FileArchive,
  doc: FileText,
  docx: FileText,
  duckdb: Database,
  eot: FileType,
  eps: FileImage,
  erl: FileCode,
  ex: FileCode,
  exs: FileCode,
  fbx: FileAxis3D,
  fish: FileTerminal,
  flac: FileMusic,
  fs: FileCode,
  fsx: FileCode,
  gif: FileImage,
  glb: FileAxis3D,
  gltf: FileAxis3D,
  go: FileCode,
  gpg: FileKey,
  gql: FileBraces,
  gradle: FileCog,
  graphql: FileBraces,
  gz: FileArchive,
  h: FileCode,
  hcl: FileSliders,
  heic: FileImage,
  hpp: FileCode,
  hrl: FileCode,
  hs: FileCode,
  htm: FileCode,
  html: FileCode,
  ico: FileImage,
  ini: FileSliders,
  ipynb: FileChartColumn,
  iso: FileArchive,
  java: FileCode,
  jpeg: FileImage,
  jpg: FileImage,
  js: FileCode,
  json: FileJson,
  json5: FileJson,
  jsonc: FileJson,
  jsx: FileCode,
  key: FileKey,
  kt: FileCode,
  kts: FileCode,
  less: FileType,
  lock: FileLock,
  log: FileText,
  lua: FileCode,
  m4a: FileMusic,
  m4v: FileVideo,
  md: FileText,
  mdx: FileText,
  mjs: FileCode,
  mkv: FileVideo,
  mmd: FileChartColumn,
  mov: FileVideo,
  mp3: FileMusic,
  mp4: FileVideo,
  mpeg: FileVideo,
  mpg: FileVideo,
  mts: FileCode,
  nim: FileCode,
  nu: FileTerminal,
  obj: FileAxis3D,
  ods: FileSpreadsheet,
  ogg: FileMusic,
  opus: FileMusic,
  otf: FileType,
  p12: FileLock,
  patch: FileDiff,
  pdf: FileText,
  pem: FileKey,
  pfx: FileLock,
  php: FileCode,
  pl: FileCode,
  pm: FileCode,
  png: FileImage,
  ppt: FileChartColumn,
  pptx: FileChartColumn,
  prisma: Database,
  properties: FileSliders,
  proto: FileBraces,
  ps1: FileTerminal,
  psd: FileImage,
  pub: FileKey,
  py: FileCode,
  r: FileCode,
  rar: FileArchive,
  rb: FileCode,
  rst: FileText,
  rs: FileCode,
  rtf: FileText,
  sass: FileType,
  scala: FileCode,
  scss: FileType,
  sh: FileTerminal,
  sol: FileCode,
  sqlite: Database,
  sqlite3: Database,
  sql: Database,
  stl: FileAxis3D,
  svelte: FileCode,
  svg: FileImage,
  swift: FileCode,
  tar: FileArchive,
  'tar.bz2': FileArchive,
  'tar.gz': FileArchive,
  'tar.xz': FileArchive,
  tbz2: FileArchive,
  tex: FileText,
  tf: FileSliders,
  tfvars: FileSliders,
  tgz: FileArchive,
  tif: FileImage,
  tiff: FileImage,
  toml: FileSliders,
  ts: FileCode,
  tsx: FileCode,
  tsv: FileSpreadsheet,
  ttf: FileType,
  txt: FileText,
  txz: FileArchive,
  vb: FileCode,
  vue: FileCode,
  wav: FileMusic,
  webm: FileVideo,
  webp: FileImage,
  woff: FileType,
  woff2: FileType,
  xhtml: FileCode,
  xls: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  xml: FileCode,
  xz: FileArchive,
  yaml: FileSliders,
  yml: FileSliders,
  zig: FileCode,
  zip: FileArchive,
  zsh: FileTerminal
}

const COMPOUND_EXTENSIONS = ['tar.bz2', 'tar.gz', 'tar.xz']

function getFilename(filePath: string | undefined | null): string {
  if (!filePath) {
    return ''
  }
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath
}

function getExtension(filename: string): string {
  const lowerName = filename.toLowerCase()
  const compoundExtension = COMPOUND_EXTENSIONS.find((ext) => lowerName.endsWith(`.${ext}`))
  if (compoundExtension) {
    return compoundExtension
  }

  const lastDot = filename.lastIndexOf('.')
  if (lastDot <= 0 || lastDot === filename.length - 1) {
    return ''
  }

  return filename.slice(lastDot + 1).toLowerCase()
}

export function getFileTypeIcon(filePath: string | undefined | null): Icon {
  const filename = getFilename(filePath)
  if (!filename) {
    return File
  }
  const lowerName = filename.toLowerCase()
  const exactMatch = FILE_ICON_BY_NAME[lowerName]
  if (exactMatch) {
    return exactMatch
  }

  // Why: simulator tabs reuse EditorFileTab chrome with a synthetic label path.
  if (lowerName === 'mobile emulator' || lowerName === 'simulator') {
    return Smartphone
  }

  if (lowerName === '.env' || lowerName.startsWith('.env.')) {
    return FileLock
  }

  if (lowerName === 'dockerfile' || lowerName.startsWith('dockerfile.')) {
    return FileCog
  }

  if (lowerName === 'makefile' || lowerName.startsWith('makefile.')) {
    return FileTerminal
  }

  // Why: filename/extension matching keeps icons deterministic for SSH worktrees
  // where OS-native file associations are not available.
  return FILE_ICON_BY_EXTENSION[getExtension(filename)] ?? File
}
