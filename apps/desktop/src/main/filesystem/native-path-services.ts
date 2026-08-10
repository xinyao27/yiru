export type NativePathServices = {
  chooseDownloadDirectory: (rendererId: number) => Promise<string | null>
  chooseDownloadFile: (rendererId: number, suggestedName: string) => Promise<string | null>
  trashPath: (targetPath: string) => Promise<void>
}
