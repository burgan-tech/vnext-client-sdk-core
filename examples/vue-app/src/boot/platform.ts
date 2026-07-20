// Coarse UA sniffing shared by the device-info + app-identity headers.
// (Web adapter only; a native adapter would report the real OS/device.)
import type { DeviceInfo } from '@burgan-tech/app-host';

/** Coarse OS name from a user-agent string. */
export function detectOs(ua: string): string {
  return /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS X/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /(iPhone|iPad|iPod)/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Web';
}

/** Coarse browser name from a user-agent string. */
export function detectBrowser(ua: string): string {
  return /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
}

/** Web device facts, sniffed from the browser. A native adapter would report the
 * real OS/device here. Consumed by the boot context provider (seeded into the
 * context-store) and by device registration. */
export function webDeviceInfo(): DeviceInfo {
  return {
    osName: detectOs(navigator.userAgent),
    osVersion: (navigator as { appVersion?: string }).appVersion ?? 'unknown',
    deviceModel: 'browser',
    manufacturer: navigator.vendor || 'unknown',
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    userAgent: navigator.userAgent,
  };
}
