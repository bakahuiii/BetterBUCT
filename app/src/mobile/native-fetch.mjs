import { CapacitorHttp, registerPlugin } from '@capacitor/core'

const TheiaHttp = registerPlugin('TheiaHttp')

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE'])

function byteString(value) {
  return String(value ?? '')
    .replace(/[^\u0000-\u00ff]/gu, '?')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, ' ')
}

export function nativeResponseHeaders(value) {
  const headers = new Headers()
  if (!value || typeof value !== 'object') return headers
  for (const [rawName, rawValue] of Object.entries(value)) {
    const name = String(rawName || '').trim()
    if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u.test(name)) continue
    const values = Array.isArray(rawValue) ? rawValue : [rawValue]
    const text = values.filter((item) => item !== undefined && item !== null).map(byteString).join(', ')
    try { headers.set(name, text) } catch { /* Ignore malformed native metadata. */ }
  }
  return headers
}

function binaryContentType(value) {
  return /\b(?:pdf|octet-stream|zip|gzip|image|audio|video|font)\b/iu.test(String(value || ''))
}

function knownBase64Signature(value) {
  return /^(?:JVBERi0|iVBORw0KGgo|\/9j\/|R0lGOD|UEsDB|H4sI)/u.test(String(value || ''))
}

export function nativeResponseBytes(value, { decodeBase64 = false } = {}) {
  if (value == null) return new Uint8Array()
  if (value instanceof Uint8Array) return new Uint8Array(value)
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  if (Array.isArray(value) && value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)) return Uint8Array.from(value)

  // Capacitor Android versions differ: arraybuffer data can arrive directly
  // as base64 or wrapped in { data: base64 }. Unwrap known binary containers
  // before serializing a response object as text.
  if (typeof value === 'object') {
    for (const key of ['data', 'base64', 'buffer']) {
      if (value[key] !== undefined && value[key] !== value) return nativeResponseBytes(value[key], { decodeBase64 })
    }
  }

  const text = typeof value === 'string' ? value : JSON.stringify(value)
  const compact = String(text || '').replace(/^data:[^,]*,/iu, '').replace(/\s+/gu, '')
  if (!compact) return new Uint8Array()
  // CapacitorHttp serializes arraybuffer/blob responses as base64 on native
  // platforms. Decode here so Response and the PDF cache receive real bytes.
  const normalized = compact.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  if ((decodeBase64 || knownBase64Signature(normalized)) && /^[A-Za-z0-9+/]+={0,2}$/u.test(padded)) {
    try {
      const binary = atob(padded)
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
      return bytes
    } catch {
      // Fall through for a non-base64 native implementation.
    }
  }
  return new TextEncoder().encode(String(text || ''))
}

export function nativeResponseBodyBytes(response) {
  const contentType = String(response?.headers?.['content-type'] || response?.headers?.['Content-Type'] || '')
  const value = response?.data
  // The Android campus transport always returns bytes as base64, including
  // JSON and error bodies. Decode before content-type handling; otherwise a
  // JSON response would be re-serialized as the base64 string itself.
  if (response?.dataEncoding === 'base64') {
    return nativeResponseBytes(value, { decodeBase64: true })
  }
  // Capacitor Android parses application/json before returning from the
  // native bridge, even when arraybuffer was requested. Re-serialize it so
  // the Fetch-compatible Response sees the original JSON bytes.
  if (/\bjson\b/iu.test(contentType)) {
    return new TextEncoder().encode(JSON.stringify(value ?? null))
  }
  // Error responses are read from HttpURLConnection's error stream and are
  // returned as plain text, not as the base64 used for successful arraybuffer
  // responses.
  if (Number(response?.status) >= 400 && typeof value === 'string') {
    return new TextEncoder().encode(value)
  }
  // CapacitorHttp returns successful arraybuffer responses as base64 even for
  // text/html. Decode every successful non-JSON response so login pages reach
  // the HTML auth detector instead of being parsed as base64 text.
  return nativeResponseBytes(value, {
    decodeBase64: response?.dataEncoding === 'base64'
      || Number(response?.status || 200) < 400
      || binaryContentType(contentType),
  })
}

function abortError() {
  const error = new Error('请求已取消')
  error.name = 'AbortError'
  return error
}

function abortableRequest(requestPromise, signal) {
  if (!signal) return requestPromise
  return new Promise((resolve, reject) => {
    let settled = false
    const cleanup = () => signal.removeEventListener?.('abort', onAbort)
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      cleanup()
      callback(value)
    }
    const onAbort = () => finish(reject, abortError())
    if (signal.aborted) {
      onAbort()
      requestPromise.catch(() => {})
      return
    }
    signal.addEventListener?.('abort', onAbort, { once: true })
    requestPromise.then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error),
    )
  })
}

// The built-in Capacitor fetch patch follows redirects before the caller can
// inspect Location. AcademicApiClient needs manual redirects so a campus
// response cannot silently turn into an unrelated final URL.
function explicitHeader(headers, name) {
  if (!headers) return null
  if (headers instanceof Headers) return headers.get(name)
  if (Array.isArray(headers)) {
    const entry = headers.find(([key]) => String(key).toLowerCase() === name.toLowerCase())
    return entry ? String(entry[1]) : null
  }
  if (typeof headers === 'object') {
    const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase())
    return key ? String(headers[key]) : null
  }
  return null
}

function requestHeadersPreservingCookie(resource, init = {}) {
  // `Cookie` is a forbidden request header in browser Fetch. Constructing a
  // Request can silently drop the explicit cookie jar that AcademicApiClient
  // passes to the native transport. Capture it before Request normalization,
  // then restore it on the object sent across the trusted Capacitor boundary.
  const explicitCookie = explicitHeader(init?.headers, 'cookie')
  const headers = new Headers(resource instanceof Request ? resource.headers : undefined)
  if (init?.headers) {
    const supplied = new Headers(init.headers)
    for (const [name, value] of supplied.entries()) headers.set(name, value)
  }
  const output = Object.fromEntries(headers.entries())
  if (explicitCookie) {
    delete output.cookie
    delete output.Cookie
    output.Cookie = explicitCookie
  }
  return output
}

function defaultNativeTransport() {
  try {
    return globalThis.window?.Capacitor?.isNativePlatform?.() ? TheiaHttp : CapacitorHttp
  } catch {
    return CapacitorHttp
  }
}

export function createNativeFetch(http = null) {
  return async function nativeFetch(resource, init = {}) {
    const transport = http || defaultNativeTransport()
    const request = new Request(resource, init)
    const headers = requestHeadersPreservingCookie(resource, init)
    const data = SAFE_METHODS.has(request.method) ? undefined : await request.text()
    const nativeOptions = {
      url: request.url,
      method: request.method,
      headers,
      ...(data !== undefined ? { data } : {}),
      disableRedirects: true,
      responseType: 'arraybuffer',
      connectTimeout: 60_000,
      readTimeout: 60_000,
    }
    let nativeResponse
    if (typeof transport?.request === 'function') {
      nativeResponse = await abortableRequest(transport.request(nativeOptions), request.signal)
    } else {
      // Android campus requests go through the same DNS-fallback CONNECT
      // proxy as the restricted CAS WebView. Other native/test platforms keep
      // CapacitorHttp's existing implementation.
      nativeResponse = await abortableRequest(TheiaHttp.request({
        ...nativeOptions,
        responseType: 'arraybuffer',
      }), request.signal)
      if (nativeResponse?.dataEncoding === 'base64') {
        nativeResponse = { ...nativeResponse, data: nativeResponse.data, responseType: 'arraybuffer' }
      }
    }
    const response = new Response(nativeResponseBodyBytes(nativeResponse), {
      status: Number(nativeResponse.status) || 200,
      headers: nativeResponseHeaders(nativeResponse.headers),
    })
    Object.defineProperty(response, 'url', {
      value: nativeResponse.url || request.url,
    })
    return response
  }
}

export const nativeFetch = createNativeFetch()
