/**
 * Sync encryption for web runtime.
 * Production implementations MUST use AES-256-GCM via platform crypto APIs
 * (Web Crypto SubtleCrypto, CryptoKit, javax.crypto).
 *
 * This module uses XOR + key-derived pad as a synchronous placeholder
 * so that the public API (setData / getData) stays synchronous per spec.
 *
 * AUTH_TAG simulates AES-GCM's authentication: a known prefix is encrypted
 * alongside the plaintext. On decrypt, if the prefix doesn't match,
 * the key is wrong and an error is thrown.
 */

const AUTH_TAG = 'CS\x00\x01';

function deriveKeyBytes(key: string): Uint8Array {
  const raw = new TextEncoder().encode(key);
  const pad = new Uint8Array(256);
  for (let i = 0; i < pad.length; i++) {
    pad[i] = raw[i % raw.length] ^ ((i * 31 + 17) & 0xff);
  }
  return pad;
}

function xor(src: Uint8Array, pad: Uint8Array): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let i = 0; i < src.length; i++) {
    out[i] = src[i] ^ pad[i % pad.length];
  }
  return out;
}

export function encrypt(plaintext: string, key: string): string {
  const pad = deriveKeyBytes(key);
  const src = new TextEncoder().encode(AUTH_TAG + plaintext);
  const out = xor(src, pad);
  return btoa(String.fromCharCode(...out));
}

export function decrypt(base64: string, key: string): string {
  const pad = deriveKeyBytes(key);
  const src = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const result = new TextDecoder().decode(xor(src, pad));

  if (!result.startsWith(AUTH_TAG)) {
    throw new Error('Decryption failed: invalid encryption key');
  }

  return result.slice(AUTH_TAG.length);
}
