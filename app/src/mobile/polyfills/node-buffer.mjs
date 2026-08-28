// Browser polyfill for node:buffer used by core modules.
import { Buffer } from 'buffer';
export { Buffer };
export const atob = (value) => Buffer.from(value, 'base64').toString('binary');
export const btoa = (value) => Buffer.from(value, 'binary').toString('base64');
export default Buffer;
