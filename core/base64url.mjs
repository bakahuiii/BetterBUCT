import { Buffer } from 'node:buffer'

// Buffer implementations used by Android WebView do not consistently expose
// Node's non-standard `base64url` output encoding. Keep the conversion
// explicit so the same core code works in Node, Vite, and Capacitor.
export function toBase64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

export function fromBase64Url(value) {
  const normalized = String(value ?? '').replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return Buffer.from(padded, 'base64')
}
