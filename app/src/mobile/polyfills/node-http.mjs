// Browser polyfill for node:http
export function createServer() { throw new Error('HTTP server is not available in the mobile WebView'); }
export default { createServer };
