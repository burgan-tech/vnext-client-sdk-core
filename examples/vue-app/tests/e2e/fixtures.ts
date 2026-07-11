import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Test credentials for the live IDM 2FA login. Kept OUT of the (public) repo:
 * loaded from the gitignored `creds.json` (copy `creds.example.json`) or from
 * E2E_USERNAME / E2E_PASSWORD / E2E_OTP env vars.
 */
export interface Creds {
  userName: string;
  password: string;
  otp: string;
}

function loadCreds(): Creds {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'creds.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) as Creds;
  const { E2E_USERNAME, E2E_PASSWORD, E2E_OTP } = process.env;
  if (E2E_USERNAME && E2E_PASSWORD && E2E_OTP) {
    return { userName: E2E_USERNAME, password: E2E_PASSWORD, otp: E2E_OTP };
  }
  throw new Error(
    'Missing test credentials. Copy tests/e2e/creds.example.json → creds.json (gitignored) ' +
      'or set E2E_USERNAME / E2E_PASSWORD / E2E_OTP.',
  );
}

export const CREDS: Creds = loadCreds();
