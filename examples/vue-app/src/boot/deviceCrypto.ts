// ─────────────────────────────────────────────────────────────────────────
// Device keypair (web) — the device's root cryptographic identity.
//
// Generated once per browser (WebCrypto RSA-2048) and persisted in context-store
// so the SAME public key is presented on every launch. The IDM keys the device
// fact by this public key, so a stable key makes registration naturally
// idempotent (re-registering returns the same device instance).
//
// NOTE: the private key is stored as PKCS8 PEM in context-store. In production
// use the encrypted secure tier (Storage.secureStorageEncrypted) + a platform
// keystore; here we keep it simple/persistent for the web dev flow.
// ─────────────────────────────────────────────────────────────────────────
import { Boundary, Storage, getContextValue, setContextValue } from '../sdk/context';

export const CERT_PUBLIC_KEY = 'device.cert.publicKeyPem';
export const CERT_PRIVATE_KEY = 'device.cert.privateKeyPem';

export interface DeviceKeyPair {
  publicKeyPem: string;
  privateKeyPem: string;
}

function toPem(buffer: ArrayBuffer, label: string): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  const b64 = btoa(binary);
  const lines = b64.match(/.{1,64}/g)?.join('\n') ?? b64;
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`;
}

async function generateDeviceKeyPair(): Promise<DeviceKeyPair> {
  const kp = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const [spki, pkcs8] = await Promise.all([
    crypto.subtle.exportKey('spki', kp.publicKey),
    crypto.subtle.exportKey('pkcs8', kp.privateKey),
  ]);
  return { publicKeyPem: toPem(spki, 'PUBLIC KEY'), privateKeyPem: toPem(pkcs8, 'PRIVATE KEY') };
}

/** Returns the persisted device keypair, generating + storing one on first launch. */
export async function getOrCreateDeviceKeyPair(): Promise<DeviceKeyPair> {
  const opts = { boundary: Boundary.device, storage: Storage.localStorage };
  const publicKeyPem = getContextValue<string>(CERT_PUBLIC_KEY, opts);
  const privateKeyPem = getContextValue<string>(CERT_PRIVATE_KEY, opts);
  if (publicKeyPem && privateKeyPem) return { publicKeyPem, privateKeyPem };

  const kp = await generateDeviceKeyPair();
  setContextValue(CERT_PUBLIC_KEY, kp.publicKeyPem, opts);
  setContextValue(CERT_PRIVATE_KEY, kp.privateKeyPem, opts);
  return kp;
}
