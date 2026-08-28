// Browser polyfill for node:module
import pkg from '../../../package.json' with { type: 'json' };

export function createRequire() {
  return (request) => {
    if (request.endsWith('package.json') || request === '../package.json') {
      return { version: pkg.version };
    }
    throw new Error('require() is not available in the mobile WebView: ' + request);
  };
}

export default { createRequire };
