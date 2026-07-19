import { getWslHomeAsync, listWslDistrosAsync } from '../wsl'

export async function resolveAiVaultWslHomeDirsForDistro(distro: string): Promise<string[]> {
  if (process.platform !== 'win32') {
    throw new Error('AI Vault WSL runtime is unavailable on this platform')
  }
  const matches = (await listWslDistrosAsync()).filter(
    (candidate) => candidate.toLowerCase() === distro.trim().toLowerCase()
  )
  if (matches.length !== 1) {
    throw new Error('AI Vault WSL distro is unavailable or ambiguous')
  }
  const home = await getWslHomeAsync(matches[0])
  if (!home) {
    throw new Error('AI Vault WSL home is unavailable')
  }
  return [home]
}
