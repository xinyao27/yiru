import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function findIosSimulatorDevice(requestedDevice, logError) {
  const devices = await listAvailableIosSimulators(logError)
  if (devices.length === 0) {
    throw new Error('No iOS simulators found. Make sure Xcode is installed.')
  }

  return (
    devices.find((device) => device.name === requestedDevice) ??
    devices.find((device) => device.name.toLowerCase().includes(requestedDevice.toLowerCase())) ??
    devices.find((device) => device.name.includes('iPhone')) ??
    devices[0]
  )
}

async function listAvailableIosSimulators(logError) {
  try {
    const { stdout } = await execFileAsync('xcrun', ['simctl', 'list', 'devices', 'available'], {
      encoding: 'utf8'
    })
    const devices = []
    let currentRuntime = ''

    for (const line of stdout.split('\n')) {
      const runtimeMatch = line.match(/^-- (.+) --$/)
      if (runtimeMatch) {
        currentRuntime = runtimeMatch[1]
        continue
      }
      const deviceMatch = line.match(/^\s+(.+?) \(([A-F0-9-]+)\)\s*(\(.*\))?\s*$/)
      if (deviceMatch && currentRuntime.includes('iOS')) {
        devices.push({
          name: deviceMatch[1].trim(),
          udid: deviceMatch[2],
          runtime: currentRuntime,
          status: deviceMatch[3] || ''
        })
      }
    }
    return devices
  } catch (error) {
    logError(`Failed to list simulators: ${error.message}`)
    return []
  }
}
