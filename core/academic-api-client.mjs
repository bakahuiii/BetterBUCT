import { constants, createPublicKey, publicEncrypt } from 'node:crypto'
import iconv from 'iconv-lite'
import { parseJwAcademicProgress } from './parsers/jwglxt.mjs'
import { mergeAcademicProgressDetails } from './academic-progress.mjs'
import { permittedCampusApiUrl } from './source-url-policy.mjs'
import { htmlLooksLikeLogin } from './util.mjs'
import { toBase64Url } from './base64url.mjs'
import { NETWORK_TIMEOUTS, timeoutMs as timeoutMilliseconds } from './network-config.mjs'

const BASE = 'https://jwglxt.buct.edu.cn/jwglxt/'
const LOGIN = new URL('xtgl/login_slogin.html', BASE).toString()
const PUBLIC_KEY = new URL('xtgl/login_getPublicKey.html', BASE).toString()
const ACADEMIC_PROGRESS = new URL('xsxy/xsxyqk_cxXsxyqkIndex.html?gnmkdm=N105515&layout=default', BASE).toString()
export const ACADEMIC_PROGRESS_DETAILS = new URL('xsxy/xsxyqk_cxJxzxjhxfyqKcxx.html?gnmkdm=N105515', BASE).toString()
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
const MAX_BINARY_RESPONSE_BYTES = 32 * 1024 * 1024
const MAX_TEXT_RESPONSE_BYTES = 16 * 1024 * 1024

export class AcademicApiError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AcademicApiError'
    this.code = code
  }
}

function decode(buffer, contentType) {
  const charset = String(contentType || '').match(/charset\s*=\s*['"]?([^;"']+)/i)?.[1]?.toLowerCase()
  return charset && !['utf-8', 'utf8'].includes(charset)
    ? iconv.decode(buffer, charset)
    : new TextDecoder().decode(buffer)
}

function diagnosticEndpoint(value) {
  try {
    const url = new URL(String(value || ''))
    return `${url.pathname}${url.search}`.slice(0, 240)
  } catch {
    return 'invalid-url'
  }
}

function finalTarget(target, responseUrl) {
  return responseUrl || target
}

function describeRequest(init = {}) {
  const body = init.body
  if (typeof body !== 'string') return { bodyType: body == null ? 'empty' : typeof body }
  const contentType = new Headers(init.headers || {}).get('content-type') || ''
  if (!/application\/x-www-form-urlencoded/i.test(contentType)) return { bodyType: 'text', bytes: Buffer.byteLength(body) }
  const params = new URLSearchParams(body)
  const keys = [...new Set([...params.keys()])].sort()
  return {
    bodyType: 'form',
    keys: keys.slice(0, 80),
    fieldCount: keys.length,
    terms: Object.fromEntries(['xnm', 'xqm', 'xkxnm', 'xkxqm', 'kzlx']
      .filter((key) => params.has(key))
      .map((key) => [key, params.get(key)])),
  }
}

function describeResponse(text) {
  const value = String(text || '').trim()
  if (!value) return { kind: 'empty' }
  if (!(value.startsWith('{') || value.startsWith('['))) {
    return { kind: /<html\b|<body\b/i.test(value) ? 'html' : 'text', bytes: Buffer.byteLength(value) }
  }
  try {
    let parsed = JSON.parse(value)
    for (let depth = 0; typeof parsed === 'string' && depth < 3; depth += 1) parsed = JSON.parse(parsed)
    const keys = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Object.keys(parsed).sort().slice(0, 80) : []
    const arrayKeys = []
    const walk = (node, path = '', depth = 0, seen = new Set()) => {
      if (!node || typeof node !== 'object' || depth > 3 || seen.has(node)) return
      seen.add(node)
      if (Array.isArray(node)) return
      for (const [key, child] of Object.entries(node)) {
        const childPath = path ? `${path}.${key}` : key
        if (Array.isArray(child)) arrayKeys.push(childPath)
        else walk(child, childPath, depth + 1, seen)
      }
    }
    walk(parsed)
    return { kind: Array.isArray(parsed) ? 'json-array' : 'json-object', keys, arrayKeys: arrayKeys.slice(0, 40) }
  } catch {
    return { kind: 'invalid-json', bytes: Buffer.byteLength(value) }
  }
}

async function readBoundedBinary(response, maximum, label = '教务附件') {
  const reader = response?.body?.getReader?.()
  if (!reader) {
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > maximum) throw new AcademicApiError(999, `${label}超过 ${Math.ceil(maximum / 1024 / 1024)} MB 限制`)
    return buffer
  }
  const chunks = []
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = Buffer.from(value)
      bytes += chunk.length
      if (bytes > maximum) {
        await reader.cancel().catch(() => {})
        throw new AcademicApiError(999, `${label}超过 ${Math.ceil(maximum / 1024 / 1024)} MB 限制`)
      }
      chunks.push(chunk)
    }
  } finally {
    reader.releaseLock?.()
  }
  return Buffer.concat(chunks, bytes)
}

function splitSetCookieHeader(value) {
  const text = String(value || '')
  if (!text) return []
  const parts = []
  let start = 0
  // Android's CapacitorHttp serializes repeated Set-Cookie headers as
  // `cookie-a=...; Path=/, cookie-b=...; Path=/`. Do not split the comma in
  // an Expires attribute; only a comma followed by a new cookie name is a
  // delimiter.
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== ',') continue
    if (!/^\s*[^=;,\s]+\s*=/u.test(text.slice(index + 1))) continue
    parts.push(text.slice(start, index).trim())
    start = index + 1
  }
  const tail = text.slice(start).trim()
  if (tail) parts.push(tail)
  return parts
}

function cookieNameValue(value) {
  const first = String(value || '').split(';', 1)[0]
  const separator = first.indexOf('=')
  return separator > 0 ? [first.slice(0, separator).trim(), first.slice(separator + 1).trim()] : null
}

function htmlAttributes(tag) {
  const attributes = new Map()
  const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gu
  for (const match of String(tag || '').matchAll(pattern)) {
    const name = String(match[1] || '').toLowerCase()
    if (!attributes.has(name)) attributes.set(name, match[2] ?? match[3] ?? match[4] ?? '')
  }
  const emptyValue = String(tag || '').match(/\bvalue\s*=\s*(?=>|\/>|$)/iu)
  if (emptyValue) attributes.set('value', '')
  return attributes
}

function htmlAttribute(tag, name) {
  return htmlAttributes(tag).get(String(name || '').toLowerCase()) ?? null
}

function loginFormFields(html) {
  const source = String(html || '')
  const form = source.match(/<form\b[^>]*action=[\"'][^\"']*login_slogin[^\"']*[\"'][\s\S]*?<\/form>/i)?.[0] || source
  const values = {}
  for (const match of form.matchAll(/<input\b[^>]*>/gi)) {
    const tag = match[0]
    const name = htmlAttribute(tag, 'name')
    if (!name) continue
    const type = String(htmlAttribute(tag, 'type') || '').toLowerCase()
    if (type === 'button' || type === 'submit' || type === 'reset' || type === 'checkbox' || type === 'radio') continue
    const value = htmlAttribute(tag, 'value')
    if (value !== null) values[name] = value
  }
  return values
}

function loginTip(html) {
  return String(html || '')
    .match(/<p\b[^>]*\bid=[\"']tips[\"'][^>]*>([\s\S]*?)<\/p>/i)?.[1]
    ?.replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim() || null
}


function encryptPassword(password, modulus, exponent) {
  const key = createPublicKey({
    key: { kty: 'RSA', n: toBase64Url(Buffer.from(modulus, 'base64')), e: toBase64Url(Buffer.from(exponent, 'base64')) },
    format: 'jwk',
  })
  return publicEncrypt({ key, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(String(password))).toString('base64')
}

function parseNumber(value) {
  const match = String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : null
}

function textFromHtml(value) {
  return String(value ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasRequirementTree(progress) {
  return Array.isArray(progress?.roots) && progress.roots.length > 0
}

function embeddedPlanMarkupVariants(html) {
  const source = String(html || '')
  const decodeEscapes = (value) => String(value || '')
    .replace(/\\u003c/gi, '<')
    .replace(/\\u003e/gi, '>')
    .replace(/\\u0022/gi, '"')
    .replace(/\\u0027/gi, "'")
    .replace(/\\(["'\\/])/g, '$1')
    .replace(/\\r\\n|\\n|\\r/g, '\n')
    .replace(/&quot;/gi, '"')
  const values = new Set([source, decodeEscapes(source)])
  // The DOM parser deliberately treats markup inside <script> as text. Pull
  // script payloads out first, then decode their JavaScript string escapes so
  // Cheerio can see the embedded <li> topology as ordinary markup.
  for (const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const script = match[1]
    values.add(script)
    values.add(decodeEscapes(script))
  }
  return [...values]
}

export function academicPlanNodes(html, sourceUrl) {
  // N105515 embeds the authoritative <li> requirement tree in JavaScript on
  // some Zhengfang releases. Decode the escaped markup before falling back to
  // its flat strings; the <li> attributes carry the actual parent and OR/AND
  // edges and must never be reconstructed from node order.
  const summary = parseJwAcademicProgress(html, { sourceUrl })
  let progress = summary
  if (!hasRequirementTree(progress)) {
    for (const markup of embeddedPlanMarkupVariants(html).slice(1)) {
      const parsed = parseJwAcademicProgress(markup, { sourceUrl })
      if (!hasRequirementTree(parsed)) continue
      // The script payload contains the authoritative tree, while GPA and
      // course totals remain in the surrounding page. Keep both halves.
      progress = mergeAcademicProgressDetails(summary, parsed)
      break
    }
  }
  const byId = new Map((progress.categories || []).map((node) => [String(node.id), node]))
  const pattern = /"([^"\r\n]+?)&nbsp;[\s\S]*?\u8981\u6c42\u5b66\u5206[\s\S]*?:\s*([\d.]+|&nbsp;)[\s\S]*?\u83b7\u5f97\u5b66\u5206[\s\S]*?:\s*([\d.]+|&nbsp;)[\s\S]*?\u672a\u83b7\u5f97\u5b66\u5206[\s\S]*?:\s*([\d.]+|&nbsp;)[\s\S]*?<span\s+id=['"]showKc([^'"]+)['"]><\/span>/g
  for (const match of String(html || '').matchAll(pattern)) {
    const title = textFromHtml(match[1])
    const id = String(match[5] || '').trim()
    if (!title || !id || byId.has(id)) continue
    byId.set(id, {
      id,
      title,
      required: parseNumber(match[2]),
      earned: parseNumber(match[3]),
      remaining: parseNumber(match[4]),
    })
  }
  // Some Zhengfang releases embed ids in JavaScript rather than direct DOM
  // attributes. Keep those ids in the fetch list even when that release does
  // not expose enough markup to reconstruct a tree.
  for (const match of String(html || '').matchAll(/xfyqjd_id\s*[=:'"]+\s*['"]?([A-Z0-9_-]{6,})/gi)) {
    const id = String(match[1]).trim()
    if (!byId.has(id)) byId.set(id, { id, title: `Requirement ${id}`, required: null, earned: null, remaining: null })
  }
  return { nodes: [...byId.values()], progress }
}

export function sidFromAcademicPage(html) {
  return String(html || '').match(/<input[^>]+id=['"]xh_id['"][^>]+value=['"]([^'"]+)/i)?.[1]?.trim() || null
}

export async function readAcademicProgressDetails(client, {
  page = null,
  username = null,
  concurrency = 4,
} = {}) {
  const overview = page || await client.page(ACADEMIC_PROGRESS, { source: 'Academic degree requirements' })
  const { nodes, progress } = academicPlanNodes(overview.text, overview.url)
  const sid = sidFromAcademicPage(overview.text) || String(username || '').trim() || null
  const details = []
  const errors = []
  let cursor = 0
  const worker = async () => {
    while (cursor < nodes.length) {
      const node = nodes[cursor]
      cursor += 1
      try {
        const text = await client.form(ACADEMIC_PROGRESS_DETAILS, {
          xfyqjd_id: node.id,
          ...(sid ? { xh_id: sid } : {}),
        }, {
          source: 'Academic degree requirement detail',
          referer: overview.url,
        })
        const parsed = JSON.parse(text)
        const courses = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.data) ? parsed.data : []
        details.push({ ...node, courses })
      } catch (error) {
        errors.push({ id: node.id, error: error instanceof Error ? error.message : String(error) })
      }
    }
  }
  const workerCount = Math.max(1, Math.min(8, Number(concurrency) || 1, nodes.length || 1))
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return { sid, progress, details, errors, sourceUrl: overview.url, nodeCount: nodes.length }
}

export class AcademicApiClient {
  constructor({ username, password, fetchImpl = fetch, requestUrl = null, timeoutMs = timeoutMilliseconds(NETWORK_TIMEOUTS.DEFAULT), onDiagnostic = () => {}, cookieHeader = '', cookies = null, allowedHosts = ['jwglxt.buct.edu.cn'], sourceLabel = '教务 API' }) {
    this.username = String(username || '').trim()
    this.password = String(password || '')
    this.fetch = fetchImpl
    this.sourceLabel = String(sourceLabel || '教务 API')
    this.allowedHosts = new Set((Array.isArray(allowedHosts) ? allowedHosts : [allowedHosts])
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean))
    // Browser preview uses a same-origin proxy; native/desktop requests keep
    // the canonical campus URL. Policy checks and diagnostics still use target.
    this.requestUrl = typeof requestUrl === 'function' ? requestUrl : (url) => url
    this.proxied = typeof requestUrl === 'function'
    this.timeoutMs = timeoutMs
    this.cookies = new Map()
    this.adoptCookieHeader(cookieHeader)
    if (cookies && typeof cookies[Symbol.iterator] === 'function') {
      for (const entry of cookies) {
        if (!Array.isArray(entry) || entry.length < 2) continue
        const name = String(entry[0] || '').trim()
        if (name) this.cookies.set(name, String(entry[1] ?? '').trim())
      }
    }
    this.onDiagnostic = typeof onDiagnostic === 'function' ? onDiagnostic : () => {}
  }

  setDiagnostic(onDiagnostic) {
    this.onDiagnostic = typeof onDiagnostic === 'function' ? onDiagnostic : () => {}
  }

  diagnostic(event, fields = {}) {
    try { this.onDiagnostic?.(event, fields) } catch { /* diagnostics must never affect requests */ }
  }

  cookieHeader() { return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ') }

  adoptCookieHeader(value) {
    for (const part of String(value || '').split(';')) {
      const separator = part.indexOf('=')
      if (separator <= 0) continue
      const name = part.slice(0, separator).trim()
      const cookieValue = part.slice(separator + 1).trim()
      if (name) this.cookies.set(name, cookieValue)
    }
    return this
  }

  absorbCookies(headers) {
    const rawValues = typeof headers?.getSetCookie === 'function'
      ? headers.getSetCookie()
      : headers?.get('set-cookie')
        ? [headers.get('set-cookie')]
        : []
    const values = rawValues.flatMap((value) => splitSetCookieHeader(value))
    values.forEach((value) => {
      const parsed = cookieNameValue(value)
      if (!parsed) return
      const attributes = String(value).split(';').slice(1).map((item) => item.trim().toLowerCase())
      const deleted = attributes.some((attribute) => attribute === 'max-age=0' || attribute.startsWith('expires=thu, 01 jan 1970'))
      if (deleted || parsed[1] === '') this.cookies.delete(parsed[0])
      else this.cookies.set(parsed[0], parsed[1])
    })
  }

  async request(url, init = {}, redirects = 0, { binary = false } = {}) {
    if (redirects > 5) throw new AcademicApiError(999, '教务 API 重定向过多')
    const startedAt = Date.now()
    let target = String(url || '')
    const method = String(init.method || 'GET').toUpperCase()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      try { target = permittedCampusApiUrl(url, [...this.allowedHosts]) } catch {
        throw new AcademicApiError(999, '教务 API 拒绝访问非校园网地址')
      }
      this.diagnostic('academic_api.request_started', {
        source: this.sourceLabel,
        method,
        url: diagnosticEndpoint(target),
        timeoutMs: this.timeoutMs,
        request: describeRequest(init),
      })
      const headers = new Headers(init.headers || {})
      headers.set('User-Agent', USER_AGENT)
      headers.set('Accept-Language', 'zh-CN,zh;q=0.9')
      if (this.cookies.size && !headers.has('Cookie')) headers.set('Cookie', this.cookieHeader())
      const response = await this.fetch(this.requestUrl(target), { ...init, headers, redirect: 'manual', signal: controller.signal })
      this.absorbCookies(response.headers)
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location')
        if (!location) throw new AcademicApiError(999, '教务 API 返回了无目标的重定向')
        let nextUrl
        try { nextUrl = permittedCampusApiUrl(new URL(location, target).toString(), [...this.allowedHosts]) } catch {
          throw new AcademicApiError(999, '教务 API 拒绝重定向到非校园网地址')
        }
        const method = String(init.method || 'GET').toUpperCase()
        const switchToGet = response.status === 303 || ([301, 302].includes(response.status) && method === 'POST')
        const nextInit = { ...init }
        // A redirect may rotate the session cookie. Never carry an explicit
        // Cookie header from the previous request over the new Set-Cookie
        // response; rebuild it from the jar after absorbing response cookies.
        const nextHeaders = new Headers(nextInit.headers || {})
        nextHeaders.delete('Cookie')
        nextHeaders.delete('cookie')
        if (this.cookies.size) nextHeaders.set('Cookie', this.cookieHeader())
        if (switchToGet) {
          nextInit.method = 'GET'
          delete nextInit.body
          nextHeaders.delete('Content-Type')
          nextHeaders.delete('Content-Length')
        }
        nextInit.headers = nextHeaders
        return this.request(nextUrl, nextInit, redirects + 1, { binary })
      }
      const declaredLength = Number(response.headers.get('content-length'))
      const maximumBytes = binary ? MAX_BINARY_RESPONSE_BYTES : MAX_TEXT_RESPONSE_BYTES
      if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
        throw new AcademicApiError(999, `教务 API 响应超过 ${Math.ceil(maximumBytes / 1024 / 1024)} MB 限制`)
      }
      const buffer = binary
        ? await readBoundedBinary(response, MAX_BINARY_RESPONSE_BYTES, '教务附件')
        : await readBoundedBinary(response, MAX_TEXT_RESPONSE_BYTES, '教务 API 响应')
      const contentType = response.headers.get('content-type') || ''
      const textual = !binary || /^(?:text\/|application\/(?:json|javascript|xml)|[\w.+-]+\/json)/iu.test(contentType) || buffer.subarray(0, 1).toString('ascii') === '<'
      const text = textual ? decode(buffer, contentType) : ''
      this.diagnostic('academic_api.request_finished', {
        source: this.sourceLabel,
        method,
        url: diagnosticEndpoint(finalTarget(target, this.proxied ? target : response.url)),
        status: response.status,
        bytes: buffer.length,
        elapsedMs: Date.now() - startedAt,
        request: describeRequest(init),
        response: textual ? describeResponse(text) : { kind: 'binary', contentType, bytes: buffer.length },
      })
      if (!response.ok) throw new AcademicApiError(response.status === 503 ? 2333 : 999, `${this.sourceLabel} 请求失败 (${response.status})`)
      let finalUrl
      try { finalUrl = permittedCampusApiUrl(this.proxied ? target : (response.url || target), [...this.allowedHosts]) } catch {
        throw new AcademicApiError(999, '教务 API 返回了非校园网地址')
      }
      return { text, url: finalUrl, headers: response.headers, ...(binary ? { buffer } : {}) }
    } catch (error) {
      if (error instanceof AcademicApiError) throw error
      if (error?.name === 'AbortError') {
        const endpoint = diagnosticEndpoint(target || url)
        const elapsedMs = Date.now() - startedAt
        this.diagnostic('academic_api.request_timeout', { source: this.sourceLabel, method, url: endpoint, timeoutMs: this.timeoutMs, elapsedMs })
        throw new AcademicApiError(1003, `${this.sourceLabel} 请求超时（${endpoint}，${Math.ceil(this.timeoutMs / 1000)} 秒）`)
      }
      const endpoint = diagnosticEndpoint(target || url)
      this.diagnostic('academic_api.request_failed', { source: this.sourceLabel, method, url: endpoint, elapsedMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) })
      throw new AcademicApiError(999, `${this.sourceLabel} 网络错误（${endpoint}）：${error instanceof Error ? error.message : String(error)}`)
    } finally { clearTimeout(timer) }
  }

  async login() {
    if (!this.username || !this.password) throw new AcademicApiError(1002, '未配置教务 API 账号或密码')
    const loginPage = await this.request(LOGIN)
    if (/id=["']yzm["']|name=["']yzm["']/i.test(loginPage.text)) throw new AcademicApiError(1001, '教务 API 当前要求验证码，本轮已停止；请改用统一身份认证浏览器通道或稍后重试')
    const fields = loginFormFields(loginPage.text)
    const csrf = fields.csrftoken
      || loginPage.text.match(/id=["']csrftoken["'][^>]*value=["']([^"']+)/i)?.[1]
      || loginPage.text.match(/name=["']csrftoken["'][^>]*value=["']([^"']+)/i)?.[1]
    if (!csrf) throw new AcademicApiError(999, '教务 API 登录页缺少安全令牌')
    let publicKey
    try { publicKey = JSON.parse((await this.request(PUBLIC_KEY)).text) } catch { throw new AcademicApiError(999, '教务 API 公钥读取失败') }
    if (!publicKey?.modulus || !publicKey?.exponent) throw new AcademicApiError(999, '教务 API 未返回有效公钥')

    // Mirror the current Zhengfang login.js flow: clear any previous account
    // in the server-side session, submit the page's hidden language/device
    // fields, and put the RSA ciphertext into both duplicate `mm` controls.
    // The browser form does this before its native submit; omitting it can
    // produce a fresh login page after an otherwise valid password.
    try {
      await this.request(new URL('xtgl/login_logoutAccount.html', BASE).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Referer: LOGIN, Origin: new URL(LOGIN).origin },
        body: new URLSearchParams({ csrfTokenLogout: fields.csrfTokenLogout || '' }).toString(),
      })
    } catch (error) {
      this.diagnostic('academic_api.login_logout_failed', { code: error?.code || 999 })
    }

    const encryptedPassword = encryptPassword(this.password, publicKey.modulus, publicKey.exponent)
    const form = new URLSearchParams()
    for (const [name, value] of Object.entries(fields)) {
      if (name === 'yhm' || name === 'mm' || name === 'csrftoken') continue
      form.set(name, value)
    }
    form.set('csrftoken', csrf)
    form.set('yhm', this.username)
    form.append('mm', encryptedPassword)
    form.append('mm', encryptedPassword)
    const loginAction = new URL(LOGIN)
    loginAction.searchParams.set('time', String(Date.now()))
    const result = await this.request(loginAction.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Referer: LOGIN,
        Origin: new URL(LOGIN).origin,
      },
      body: form.toString(),
    })
    const tip = loginTip(result.text)
    if (tip) throw new AcademicApiError(/用户名或密码|用户不存在|验证码/.test(tip) ? 1002 : 998, tip)
    if (htmlLooksLikeLogin(result.text, result.url)) {
      throw new AcademicApiError(1002, '教务 API 登录未完成，服务器仍返回登录页；请确认账号状态或使用统一身份认证登录')
    }
    return this.page(new URL('xtgl/index_initMenu.html', BASE).toString(), { source: '教务 API' })
  }

  async page(url, { source = '教务 API' } = {}) {
    const result = await this.request(url)
    if (htmlLooksLikeLogin(result.text, result.url)) throw new AcademicApiError(1006, `${source} 会话已失效`)
    return result
  }

  async binary(url, { source = '教务 API' } = {}) {
    const result = await this.request(url, {}, 0, { binary: true })
    if (result.text && htmlLooksLikeLogin(result.text, result.url)) {
      throw new AcademicApiError(1006, `${source} 会话已失效`)
    }
    return result
  }

  async form(url, values, { source = '教务 API', referer = url } = {}) {
    const result = await this.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Referer: referer, 'X-Requested-With': 'XMLHttpRequest' },
      body: new URLSearchParams(values || {}).toString(),
    })
    if (htmlLooksLikeLogin(result.text, result.url)) throw new AcademicApiError(1006, `${source} 会话已失效`)
    return result.text
  }

  // The overview page contains requirement identifiers. Fetching their rows
  // through this same cookie jar avoids invalidating the browser SSO session.
  async academicProgressDetails() {
    return readAcademicProgressDetails(this, { username: this.username })
  }
}

export { BASE as ACADEMIC_API_BASE }
