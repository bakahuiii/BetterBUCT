import * as cheerio from 'cheerio'
import { normalizeText, parseDateLike, stableId } from '../util.mjs'
import { parseTheolAttachmentLinks } from './theol-archive.mjs'

const BASE = 'https://course.buct.edu.cn/meol/'
const MOBILE_BASE = 'http://course.buct.edu.cn/mobile/'
const SAFE_CAMPUS_HOST = /(?:^|\.)buct\.edu\.cn$/iu

function statusCode(value) {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function mobileTaskGroups(course) {
  return Object.entries(course || {})
    .filter(([key, value]) => /^reminderList/i.test(key) && Array.isArray(value))
    .flatMap(([, value]) => value)
}


function mobileTaskKind(item) {
  return Object.hasOwn(item || {}, 'expiredTime') || Object.hasOwn(item || {}, 'examType')
    ? 'online-test'
    : 'assignment'
}

function mobileTaskUrl(kind, id) {
  const path = kind === 'online-test'
    ? `common/question/test/student/stu_qtest_navigate.jsp?testId=${encodeURIComponent(id)}`
    : `common/hw/student/hwtask.view.jsp?hwtid=${encodeURIComponent(id)}`
  return new URL(path, BASE).toString()
}

function courseUrl(courseId) {
  return new URL(`homepage/course/course_index.jsp?courseId=${encodeURIComponent(courseId)}`, BASE).toString()
}

function knownCourse(courses, courseId) {
  return (courses || []).find((course) => String(course?.id || '').trim() === courseId) || null
}

function safeCampusUrl(rawUrl, baseUrl) {
  try {
    const url = new URL(String(rawUrl || ''), baseUrl)
    if (!['http:', 'https:'].includes(url.protocol) || !SAFE_CAMPUS_HOST.test(url.hostname)) return null
    return url.toString()
  } catch {
    return null
  }
}

/**
 * Keep the useful HTML from THEOL homework content while removing executable
 * markup and off-campus resources before it reaches React innerHTML.
 */
export function sanitizeTheolHtml(rawHtml, { baseUrl = MOBILE_BASE } = {}) {
  const source = String(rawHtml || '').trim()
  if (!source) return ''
  const $ = cheerio.load(`<div data-theia-homework-root="true">${source}</div>`, { decodeEntities: false })
  const root = $('[data-theia-homework-root="true"]').first()
  root.find('script, style, noscript, template, iframe, frame, object, embed, form, input, button, select, textarea, video, audio, source, link, meta, base, svg, math').remove()
  root.find('*').each((_index, node) => {
    const element = $(node)
    for (const attribute of Object.keys(node.attribs || {})) {
      if (/^on[a-z]/iu.test(attribute) || attribute.toLowerCase() === 'style' || attribute.toLowerCase() === 'srcset') {
        element.removeAttr(attribute)
      }
    }
    for (const attribute of ['href', 'src']) {
      if (!element.attr(attribute)) continue
      const safe = safeCampusUrl(element.attr(attribute), baseUrl)
      if (!safe) element.removeAttr(attribute)
      else element.attr(attribute, safe)
    }
    if (node.tagName?.toLowerCase() === 'a' && element.attr('href')) {
      element.attr('target', '_blank')
      element.attr('rel', 'noopener noreferrer')
    }
    if (node.tagName?.toLowerCase() === 'img') {
      element.attr('loading', 'lazy')
      element.attr('alt', normalizeText(element.attr('alt')) || '作业图片')
    }
  })
  return String(root.html() || '').trim().slice(0, 120_000)
}

function mobileTaskId(sourceUrl, kind = 'assignment') {
  try {
    const url = new URL(String(sourceUrl || ''))
    const parameter = kind === 'online-test' ? 'testId' : 'hwtid'
    const id = url.searchParams.get(parameter)
    return /^\d+$/.test(String(id || '')) ? String(id) : null
  } catch {
    return null
  }
}

function parseJsonObject(raw, label) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw
  try {
    const parsed = JSON.parse(String(raw || ''))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not-object')
    return parsed
  } catch {
    throw new Error(`${label}返回了无法解析的 JSON`)
  }
}

// The endpoint has historically returned a sessionid alongside the payload.
// This parser intentionally accepts only task fields and never returns it.
export function parseTheolMobileTaskList(payload, { courses = [], capturedAt = new Date().toISOString() } = {}) {
  const status = statusCode(payload?.status)
  if (status === -2) return { authenticated: false, assignments: [] }
  if (status !== 1 || !Array.isArray(payload?.datas)) {
    throw new Error('THEOL mobile task endpoint returned an unsupported payload')
  }

  const assignments = []
  for (const courseItem of payload.datas) {
    const courseId = String(courseItem?.courseId ?? '').trim()
    if (!/^\d+$/.test(courseId)) continue
    const course = knownCourse(courses, courseId)
    // The mobile endpoint is already scoped to the authenticated THEOL
    // account. Treat its courseId/courseName as authoritative instead of
    // dropping tasks when the HTML course roster is partial, stale, or uses a
    // different course-list layout. The roster is only enrichment here.
    const courseName = normalizeText(courseItem?.courseName) || course?.title || `课程 ${courseId}`
    for (const task of mobileTaskGroups(courseItem)) {
      if (!task || typeof task !== 'object') continue
      const taskId = String(task.id ?? '').trim()
      const title = normalizeText(task.title)
      if (!/^\d+$/.test(taskId) || !title) continue
      const kind = mobileTaskKind(task)
      assignments.push({
        id: stableId('theol-assignment', kind, taskId),
        kind,
        courseId,
        courseName,
        courseSourceUrl: course?.sourceUrl || courseUrl(courseId),
        title,
        dueAt: parseDateLike(kind === 'online-test' ? task.expiredTime : task.deadline),
        status: 'pending',
        source: 'theol',
        sourceUrl: mobileTaskUrl(kind, taskId),
        capturedAt,
      })
    }
  }

  return {
    authenticated: true,
    assignments: [...new Map(assignments.map((item) => [item.id, item])).values()].slice(0, 500),
  }
}

/**
 * Parse the Courser-compatible homeworkView.do response. The body is kept as
 * sanitized HTML for the mobile reader and as bounded plain text for a
 * fallback/accessible rendering.
 */
export function parseTheolMobileHomeworkDetail(payload, { assignment = null, baseUrl = MOBILE_BASE } = {}) {
  const value = parseJsonObject(payload, 'THEOL 作业详情')
  const responseStatus = statusCode(value.status)
  if (responseStatus === -2) {
    return { authenticated: false, assignmentId: assignment?.id || null, contentHtml: '', contentText: '' }
  }
  if (responseStatus !== 1 || !value.datas || typeof value.datas !== 'object') {
    throw new Error('THEOL homework detail endpoint returned an unsupported payload')
  }
  const datas = value.datas
  const rawContent = String(datas.taskContent || '')
  const contentHtml = sanitizeTheolHtml(rawContent, { baseUrl })
  const contentText = normalizeText(cheerio.load(`<div>${contentHtml}</div>`).text()).slice(0, 24_000) || null
  const serverHasSubmit = Boolean(datas.hasSubmit === true || datas.hasSubmit === 1 || datas.hasSubmit === '1' || datas.hasSubmit === 'true')
  const serverMaySubmit = Boolean(datas.maySubmit === true || datas.maySubmit === 1 || datas.maySubmit === '1' || datas.maySubmit === 'true')
  // THEOL's mobile field `hasSubmit` is not reliable as a submission-state
  // marker: pending homework pages can expose it while the page is merely
  // showing the submit-capable task shell. The task-list status is the
  // authoritative state for the mobile reader; do not turn a pending card
  // into 已提交 just because homeworkView.do returned hasSubmit=true.
  const status = assignment?.status === 'submitted'
    ? 'submitted'
    : assignment?.status === 'pending'
      ? 'pending'
      : serverHasSubmit && !serverMaySubmit ? 'submitted' : 'pending'
  const submitted = status === 'submitted'
  const attachments = parseTheolAttachmentLinks(rawContent, { baseUrl })
  return {
    authenticated: true,
    assignmentId: assignment?.id || null,
    courseId: assignment?.courseId || null,
    title: normalizeText(datas.taskTitle) || assignment?.title || '课程作业',
    contentHtml,
    contentText,
    hasSubmit: submitted,
    maySubmit: !submitted && (assignment?.status === 'pending' || serverMaySubmit),
    mayModify: Number.isFinite(Number(datas.mayModify)) ? Number(datas.mayModify) : null,
    hwTaskId: datas.hwTaskId ?? null,
    status,
    attachments,
  }
}

export { mobileTaskId, MOBILE_BASE }
