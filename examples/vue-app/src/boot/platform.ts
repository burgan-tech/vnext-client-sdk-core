// Coarse UA sniffing shared by the device-info + app-identity headers.
// (Web adapter only; a native adapter would report the real OS/device.)

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
