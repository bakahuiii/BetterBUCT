// Verify the node-crypto polyfill produces valid RSA PKCS1 v1.5 ciphertext
// that Node can decrypt — validates the jwglxt login encryption port.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import nodeCrypto from 'node:crypto';
import { toBase64Url } from '../../core/base64url.mjs';

// Load the polyfill module (it imports jsrsasign + buffer)
const polyfill = await import('../src/mobile/polyfills/node-crypto.mjs');

// Generate an RSA key pair with Node
const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

test('toBase64Url uses standard base64 conversion without padding', () => {
  assert.equal(toBase64Url(Buffer.from([251, 255, 239, 250])), '-__v-g');
  assert.equal(toBase64Url('学生'), '5a2m55Sf');
  assert.equal(toBase64Url(Buffer.from([0, 1, 2])), 'AAEC');
});

test('publicEncrypt produces Node-decryptable PKCS1 v1.5 ciphertext', () => {
  // Convert Node public key to JWK (base64url n/e) like jwglxt's key endpoint
  const jwk = publicKey.export({ format: 'jwk' });
  assert.equal(jwk.kty, 'RSA');

  const password = 'Test-Password-123!';
  const encrypted = polyfill.publicEncrypt(
    { key: polyfill.createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e } }) },
    Buffer.from(password),
  );
  assert.ok(encrypted.length > 0, 'ciphertext produced');

  const decrypted = nodeCrypto.privateDecrypt(
    { key: privateKey, padding: nodeCrypto.constants.RSA_PKCS1_PADDING },
    encrypted,
  );
  assert.equal(decrypted.toString('utf8'), password, 'round-trip matches');
});

test('createHash produces correct sha256 hex', () => {
  const hash = polyfill.createHash('sha256').update('hello').digest('hex');
  assert.equal(hash, nodeCrypto.createHash('sha256').update('hello').digest('hex'));
});
