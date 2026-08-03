import { spawn } from 'node:child_process'
import net from 'node:net'
import os from 'node:os'
import process from 'node:process'
import readline from 'node:readline'

import { getMobileExpoExecutablePath } from '../expo-cli.mjs'

const DEFAULT_METRO_PORT = 8081
const METRO_PORT_SEARCH_LIMIT = 100

export function lanIpCandidates() {
  const entries = Object.entries(os.networkInterfaces()).flatMap(([name, interfaces]) =>
    (interfaces || []).map((networkInterface) => ({ name, networkInterface }))
  )
  return entries
    .filter(({ name, networkInterface }) => {
      if (!networkInterface || networkInterface.family !== 'IPv4' || networkInterface.internal) {
        return false
      }
      if (networkInterface.address.startsWith('169.254.')) {
        return false
      }
      return !/^(awdl|bridge|gif|llw|p2p|stf|utun)/.test(name)
    })
    .sort((a, b) => interfaceRank(a.name) - interfaceRank(b.name))
    .map(({ networkInterface }) => networkInterface.address)
}

export function devClientUrlForMetroUrl(url) {
  return `exp+yiru-mobile://expo-development-client/?url=${encodeURIComponent(url)}`
}

export async function startMetro({ environment, logger, mobileDir, requestedPort, waitForReady }) {
  logger.step('2', 'Starting Metro bundler...')
  const metroPort = await resolveMetroPort(requestedPort, logger)

  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      EXPO_NO_TELEMETRY: '1'
    }
    if (environment === 'ui-lab') {
      env.EXPO_PUBLIC_YIRU_UI_LAB = '1'
    }
    if (environment === 'development-desktop') {
      env.EXPO_PUBLIC_YIRU_AUTO_PAIR = '1'
    }

    const expoPath = getMobileExpoExecutablePath(mobileDir)
    if (!expoPath) {
      reject(new Error('Mobile Expo CLI is missing after dependency setup.'))
      return
    }
    logger.info(`Using expo at: ${expoPath}`)
    const metro = spawn(expoPath, ['start', '--host', 'lan', '--port', String(metroPort)], {
      cwd: mobileDir,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let output = ''
    let url = null
    let resolved = false
    let exited = false
    let stdoutLines = null
    let stderrLines = null

    const metroResult = () => ({
      process: metro,
      url,
      output,
      isExited: () => exited,
      closeOutput: () => {
        stdoutLines?.close()
        stderrLines?.close()
        metro.stdin?.destroy()
        metro.stdout?.destroy()
        metro.stderr?.destroy()
      }
    })

    stdoutLines = readline.createInterface({ input: metro.stdout })
    stdoutLines.on('line', (line) => {
      output += `${line}\n`
      logger.output(line)

      const waitingMatch = line.match(/Waiting on (http:\/\/[^:]+):(\d+)/)
      if (waitingMatch && !resolved) {
        const host = waitingMatch[1]
        const port = waitingMatch[2]
        url = normalizeMetroUrl(`${host}:${port}`)
        logger.info(`Found Metro URL: ${url}`)

        if (!waitForReady) {
          resolved = true
          resolve(metroResult())
        }
      }

      const urlMatch = line.match(/exp\+yiru-mobile:\/\/expo-development-client\/\?url=([^\s]+)/)
      if (urlMatch && !resolved) {
        url = normalizeMetroUrl(decodeURIComponent(urlMatch[1]))
        logger.info(`Found Metro URL: ${url}`)

        if (!waitForReady) {
          resolved = true
          resolve(metroResult())
        }
      }

      if (
        line.includes('packager-status:running') ||
        line.includes('Metro waiting') ||
        line.includes('Logs for your project will appear below')
      ) {
        if (url && !resolved) {
          resolved = true
          resolve(metroResult())
        }
      }
    })

    stderrLines = readline.createInterface({ input: metro.stderr })
    stderrLines.on('line', (line) => {
      output += `${line}\n`
      logger.errorOutput(line)
    })

    metro.on('error', (error) => {
      if (!resolved) {
        resolved = true
        reject(new Error(`Failed to start Metro: ${error.message}`))
      }
    })

    metro.on('exit', (code) => {
      exited = true
      if (!resolved) {
        resolved = true
        if (code !== 0) {
          reject(new Error(`Metro exited with code ${code}`))
        } else {
          resolve(metroResult())
        }
      }
    })

    setTimeout(() => {
      if (!resolved) {
        resolved = true
        metro.kill()
        reject(new Error('Timeout waiting for Metro to start'))
      }
    }, 120_000)
  })
}

export async function findReachableMetroUrl(initialUrl) {
  for (const candidate of metroUrlCandidates(initialUrl)) {
    if (await verifyMetro(candidate)) {
      return { url: candidate, reachable: true }
    }
  }
  return { url: initialUrl, reachable: false }
}

function interfaceRank(name) {
  return /^(en|eth|wlan)/.test(name) ? 0 : 1
}

function isLoopbackHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0'
}

function normalizeMetroUrl(rawUrl) {
  try {
    const url = new URL(rawUrl)
    const lanIp = lanIpCandidates()[0]
    if (lanIp && isLoopbackHost(url.hostname)) {
      url.hostname = lanIp
    }
    return url.toString().replace(/\/$/, '')
  } catch {
    return rawUrl
  }
}

function metroUrlCandidates(initialUrl) {
  try {
    const url = new URL(initialUrl)
    const hosts = [url.hostname, ...lanIpCandidates(), 'localhost', '127.0.0.1']
    const uniqueHosts = [...new Set(hosts.filter(Boolean))]
    return uniqueHosts.map((host) => {
      const candidate = new URL(url.toString())
      candidate.hostname = host
      return candidate.toString().replace(/\/$/, '')
    })
  } catch {
    return [initialUrl]
  }
}

function canListenOnPort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
        resolve(false)
        return
      }
      reject(error)
    })
    server.listen({ port, host: '0.0.0.0' }, () => {
      server.close(() => resolve(true))
    })
  })
}

async function findAvailableMetroPort(startPort) {
  const endPort = startPort + METRO_PORT_SEARCH_LIMIT
  for (let port = startPort; port < endPort; port++) {
    if (await canListenOnPort(port)) {
      return port
    }
  }
  throw new Error(`No available Metro port found from ${startPort} to ${endPort - 1}`)
}

async function resolveMetroPort(requestedPortValue, logger) {
  if (requestedPortValue) {
    const requestedPort = Number(requestedPortValue)
    if (!Number.isInteger(requestedPort) || requestedPort <= 0 || requestedPort > 65_535) {
      throw new Error(`Invalid Metro port: ${requestedPortValue}`)
    }
    return requestedPort
  }

  const port = await findAvailableMetroPort(DEFAULT_METRO_PORT)
  if (port !== DEFAULT_METRO_PORT) {
    logger.info(`Port ${DEFAULT_METRO_PORT} is already in use; using ${port} instead`)
  }
  return port
}

async function verifyMetro(url) {
  const urlObject = new URL(url)
  const statusUrl = new URL('/status', `${urlObject.protocol}//${urlObject.host}`).toString()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5_000)

  try {
    const response = await fetch(statusUrl, { signal: controller.signal })
    return (await response.text()).includes('packager-status:running')
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}
