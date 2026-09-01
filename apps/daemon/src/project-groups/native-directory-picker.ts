export type NativeDirectoryPicker = {
  pickDirectory: (options?: { multiple?: boolean }) => Promise<string[]>
}
