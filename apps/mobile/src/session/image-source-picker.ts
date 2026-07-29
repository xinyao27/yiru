// Why: import from 'buffer' (the npm polyfill), not 'node:buffer' — Metro
// can't resolve Node's builtin in a React Native bundle.
import { Buffer } from 'buffer'

import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'

export type MobileImageSource = 'camera' | 'library' | 'files'

export type PickedMobileImage = {
  // Raw base64 (no data: prefix); fed straight into the existing upload pipeline.
  readonly base64: string
}

export class ImageLibraryPermissionError extends Error {
  constructor() {
    super('Photo library permission denied')
    this.name = 'ImageLibraryPermissionError'
  }
}

export class CameraPermissionError extends Error {
  constructor() {
    super('Camera permission denied')
    this.name = 'CameraPermissionError'
  }
}

// Why: expo-document-picker returns a file URI, not base64. Read it through
// fetch + Buffer so we match the base64 contract the upload pipeline expects
// without pulling in expo-file-system.
async function readUriAsBase64(uri: string): Promise<string> {
  const response = await fetch(uri)
  const bytes = new Uint8Array(await response.arrayBuffer())
  return Buffer.from(bytes).toString('base64')
}

async function pickFromLibrary(
  requestPermission: typeof ImagePicker.requestMediaLibraryPermissionsAsync = ImagePicker.requestMediaLibraryPermissionsAsync,
  launch: typeof ImagePicker.launchImageLibraryAsync = ImagePicker.launchImageLibraryAsync
): Promise<PickedMobileImage | null> {
  const permission = await requestPermission()
  // Why: `granted` covers full + limited iOS access; only a hard denial blocks us.
  if (!permission.granted) {
    throw new ImageLibraryPermissionError()
  }
  const result = await launch({
    mediaTypes: ['images'],
    base64: true,
    allowsMultipleSelection: false,
    quality: 1
  })
  if (result.canceled) {
    return null
  }
  const asset = result.assets[0]
  const base64 = asset?.base64 ?? (asset?.uri ? await readUriAsBase64(asset.uri) : null)
  if (!base64) {
    return null
  }
  return { base64 }
}

async function pickFromCamera(
  requestPermission: typeof ImagePicker.requestCameraPermissionsAsync = ImagePicker.requestCameraPermissionsAsync,
  launch: typeof ImagePicker.launchCameraAsync = ImagePicker.launchCameraAsync
): Promise<PickedMobileImage | null> {
  const permission = await requestPermission()
  if (!permission.granted) {
    throw new CameraPermissionError()
  }
  const result = await launch({
    mediaTypes: ['images'],
    base64: true,
    quality: 1
  })
  if (result.canceled) {
    return null
  }
  const asset = result.assets[0]
  const base64 = asset?.base64 ?? (asset?.uri ? await readUriAsBase64(asset.uri) : null)
  return base64 ? { base64 } : null
}

async function pickFromFiles(
  launch: typeof DocumentPicker.getDocumentAsync = DocumentPicker.getDocumentAsync
): Promise<PickedMobileImage | null> {
  const result = await launch({
    type: 'image/*',
    multiple: false,
    copyToCacheDirectory: true
  })
  if (result.canceled) {
    return null
  }
  const asset = result.assets[0]
  if (!asset?.uri) {
    return null
  }
  return { base64: await readUriAsBase64(asset.uri) }
}

export async function pickMobileImage(
  source: MobileImageSource,
  deps?: {
    readonly requestCameraPermission?: typeof ImagePicker.requestCameraPermissionsAsync
    readonly launchCamera?: typeof ImagePicker.launchCameraAsync
    readonly requestLibraryPermission?: typeof ImagePicker.requestMediaLibraryPermissionsAsync
    readonly launchLibrary?: typeof ImagePicker.launchImageLibraryAsync
    readonly launchFiles?: typeof DocumentPicker.getDocumentAsync
  }
): Promise<PickedMobileImage | null> {
  if (source === 'camera') {
    return pickFromCamera(deps?.requestCameraPermission, deps?.launchCamera)
  }
  if (source === 'library') {
    return pickFromLibrary(deps?.requestLibraryPermission, deps?.launchLibrary)
  }
  return pickFromFiles(deps?.launchFiles)
}
