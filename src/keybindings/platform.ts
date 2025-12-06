import type { KeybindingPlatform } from '@/settings/types'

function getNodePlatform(): string | undefined {
  if (typeof globalThis === 'undefined') {
    return undefined
  }
  const globalProcess = (globalThis as { process?: { platform?: string } }).process
  return globalProcess?.platform
}

export function detectKeybindingPlatform(): KeybindingPlatform {
  if (typeof navigator !== 'undefined') {
    const nav = navigator as typeof navigator & { userAgentData?: { platform?: string } }
    const platform = (
      nav.userAgentData?.platform ||
      navigator.platform ||
      navigator.userAgent ||
      ''
    ).toLowerCase()
    if (platform.includes('mac')) {
      return 'mac'
    }
    if (platform.includes('win')) {
      return 'windows'
    }
  }
  const nodePlatform = getNodePlatform()
  if (nodePlatform === 'darwin') {
    return 'mac'
  }
  if (nodePlatform === 'win32') {
    return 'windows'
  }
  return 'linux'
}
