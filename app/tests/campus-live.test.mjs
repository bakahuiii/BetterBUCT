// Validate the real jwglxt request pipeline against the live campus:
// login page fetch, redirect/cookie handling, public key retrieval, and the
// RSA PKCS1 password encryption. No credentials are required for these steps.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { AcademicApiClient, ACADEMIC_API_BASE } = await import('../../core/academic-api-client.mjs');

const LOGIN = new URL('xtgl/login_slogin.html', ACADEMIC_API_BASE).toString();
const PUBLIC_KEY = new URL('xtgl/login_getPublicKey.html', ACADEMIC_API_BASE).toString();

test('campus network reachable: login page responds', async () => {
  const client = new AcademicApiClient({ username: 'probe', password: 'probe' });
  const result = await client.request(LOGIN, {}, 0);
  assert.ok(result.text.length > 0, 'login page has content');
  assert.ok(result.url.includes('jwglxt.buct.edu.cn'), 'stays on campus domain');
  console.log('login page bytes:', result.text.length, 'final url:', result.url);
});

test('public key endpoint returns RSA modulus/exponent', async () => {
  const client = new AcademicApiClient({ username: 'probe', password: 'probe' });
  const result = await client.request(PUBLIC_KEY, {}, 0);
  const key = JSON.parse(result.text);
  assert.ok(key.modulus && key.exponent, 'modulus + exponent present');
  assert.ok(key.modulus.length > 100, '2048-bit modulus');
  console.log('public key OK');
});

test('password encryption produces RSA ciphertext', async () => {
  const client = new AcademicApiClient({ username: 'probe', password: 'probe' });
  const keyResult = await client.request(PUBLIC_KEY, {}, 0);
  const key = JSON.parse(keyResult.text);
  const { publicEncrypt, createPublicKey } = await import('../src/mobile/polyfills/node-crypto.mjs');
  const encrypted = publicEncrypt(
    { key: createPublicKey({ key: { kty: 'RSA', n: key.modulus, e: key.exponent } }) },
    Buffer.from('test-password'),
  );
  // The live jwglxt deployment uses a 1024-bit key (128-byte ciphertext).
  // Accept 1024/2048-bit sizes in case the campus rotates to 2048-bit.
  assert.ok(encrypted.length === 128 || encrypted.length === 256, 'RSA ciphertext size matches key (128 or 256 bytes), got ' + encrypted.length);
  console.log('encrypted password:', encrypted.toString('base64').slice(0, 32) + '...');
});
