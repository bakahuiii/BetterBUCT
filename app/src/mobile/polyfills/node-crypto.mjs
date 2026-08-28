// Browser polyfill for the subset of node:crypto used by THEIA core modules.
// Enables reusing core/academic-api-client.mjs (RSA PKCS1 v1.5 login) and other
// core logic inside the Capacitor WebView without modifying the desktop files.
import forge from 'node-forge';
import { KJUR } from 'jsrsasign';
import { Buffer } from 'buffer';

export const constants = {
  RSA_PKCS1_PADDING: 1,
  RSA_PKCS1_OAEP_PADDING: 4,
};

function toBuffer(input, encoding) {
  if (Buffer.isBuffer(input)) return input;
  if (typeof input === 'string') return Buffer.from(input, encoding || 'utf8');
  if (input instanceof Uint8Array) return Buffer.from(input);
  if (ArrayBuffer.isView(input)) return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (input instanceof ArrayBuffer) return Buffer.from(input);
  throw new Error('unsupported input for crypto shim');
}

function base64urlToBytes(value) {
  const b64 = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '==='.slice((b64.length + 3) % 4);
  return forge.util.decode64(padded);
}

// Accepts the same JWK shape desktop passes: { kty:'RSA', n, e } with base64url
// fields, or a PEM string. Returns a node-forge public key object.
export function createPublicKey(input) {
  if (typeof input === 'string') {
    return { type: 'pem', key: input };
  }
  const jwk = input?.key || input;
  if (jwk?.kty === 'RSA') {
    const nHex = forge.util.bytesToHex(base64urlToBytes(jwk.n));
    const eHex = forge.util.bytesToHex(base64urlToBytes(jwk.e));
    const n = new forge.jsbn.BigInteger(nHex, 16);
    const e = new forge.jsbn.BigInteger(eHex, 16);
    return { type: 'forge', key: forge.pki.setRsaPublicKey(n, e) };
  }
  throw new Error('unsupported public key format');
}

// RSA public-key encryption with PKCS#1 v1.5 padding (the jwglxt login scheme).
// WebCrypto only offers RSA-OAEP, so this uses node-forge's pure-JS RSA.
export function publicEncrypt(options, message) {
  const key = options?.key;
  if (!key) throw new Error('missing public key');
  let pub;
  if (key.type === 'forge') {
    pub = key.key;
  } else if (key.type === 'pem') {
    pub = forge.pki.publicKeyFromPem(key.key);
  } else {
    throw new Error('unsupported public key handle');
  }
  const encrypted = pub.encrypt(toBuffer(message).toString('binary'), 'RSAES-PKCS1-V1_5');
  return Buffer.from(encrypted, 'binary');
}

export function randomBytes(size) {
  const bytes = new Uint8Array(size);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < size; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Buffer.from(bytes);
}

export function randomUUID() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
}

// SHA-1/256/384/512 via jsrsasign — synchronous, matches node:crypto usage.
const HASH_ALGOS = { sha1: 'sha1', sha256: 'sha256', sha384: 'sha384', sha512: 'sha512' };

export function createHash(algorithm = 'sha256') {
  const normalized = String(algorithm).toLowerCase().replace('-', '');
  const algo = HASH_ALGOS[normalized];
  if (!algo) throw new Error('unsupported hash algorithm: ' + algorithm);
  const chunks = [];
  return {
    update(input, encoding) {
      chunks.push(toBuffer(input, encoding));
      return this;
    },
    digest(encoding) {
      const data = Buffer.concat(chunks).toString('binary');
      const hex = KJUR.crypto.Util.hashString(data, algo);
      const digestBuffer = Buffer.from(hex, 'hex');
      return encoding === 'hex' ? digestBuffer.toString('hex') : digestBuffer;
    },
  };
}

// timingSafeEqual for local-api style comparisons
export function timingSafeEqual(left, right) {
  const a = toBuffer(left);
  const b = toBuffer(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export default { constants, createPublicKey, publicEncrypt, randomBytes, randomUUID, createHash, timingSafeEqual };
