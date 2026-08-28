// Browser polyfill for node:module (used by schema.mjs for createRequire).
export function createRequire() {
  return (path) => {
    throw new Error('require() is not available in the mobile WebView');
  };
}
export default { createRequire };
