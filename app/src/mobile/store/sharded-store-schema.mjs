// Mobile port of theia-sharded-store/v1 schema
// Compatible with desktop BetterBUCT store for data interoperability

export const SHARDED_STORE_SCHEMA = 'theia-sharded-store/v1';
export const STORE_FRAGMENT_SCHEMA = 'theia-state-fragment/v1';

// Fragment keys mirroring desktop's stateFragments()
export const FRAGMENT_KEYS = [
  'state/meta',
  'state/profile',
  'state/settings',
  'state/sync',
  'academic/terms',
  'academic/courses',
  'academic/schedule',
  'academic/exams',
  'academic/grades',
  'academic/selected-courses',
  'academic/progress',
  'academic/extras',
  'academic/plan-document',
  'coursework/assignments',
  'coursework/workspaces',
  'communication/notices',
  'communication/emails',
  'catalog/index',
];

export function extractFragmentKey(stateKey) {
  const mapping = {
    terms: 'academic/terms',
    courses: 'academic/courses',
    schedule: 'academic/schedule',
    exams: 'academic/exams',
    grades: 'academic/grades',
    selectedCourses: 'academic/selected-courses',
    academicProgress: 'academic/progress',
    academicExtras: 'academic/extras',
    academicPlanDocument: 'academic/plan-document',
    assignments: 'coursework/assignments',
    workspaces: 'coursework/workspaces',
    notices: 'communication/notices',
    emails: 'communication/emails',
    dataCatalog: 'catalog/index',
  };
  return mapping[stateKey] || null;
}

export function splitStateIntoFragments(state) {
  const fragments = new Map();
  fragments.set('state/meta', {
    appVersion: state.appVersion,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  });
  fragments.set('state/profile', state.profile);
  fragments.set('state/settings', state.settings);
  fragments.set('state/sync', state.sync);
  fragments.set('academic/terms', state.terms);
  fragments.set('academic/courses', state.courses);
  fragments.set('academic/schedule', state.schedule);
  fragments.set('academic/exams', state.exams);
  fragments.set('academic/grades', state.grades);
  fragments.set('academic/selected-courses', state.selectedCourses);
  fragments.set('academic/progress', state.academicProgress);
  fragments.set('academic/extras', state.academicExtras);
  fragments.set('academic/plan-document', state.academicPlanDocument);
  fragments.set('coursework/assignments', state.assignments);
  fragments.set('coursework/workspaces', state.workspaces);
  fragments.set('communication/notices', state.notices);
  fragments.set('communication/emails', state.emails);
  fragments.set('catalog/index', state.dataCatalog);
  return fragments;
}

export function mergeFragmentsIntoState(fragments) {
  const state = {};
  // Default empty state structure
  const empty = {
    schema: 'theia-campus-data/v1',
    appVersion: '0.0.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    profile: null,
    terms: [],
    courses: [],
    schedule: [],
    exams: [],
    grades: [],
    selectedCourses: [],
    academicProgress: null,
    academicExtras: null,
    academicPlanDocument: null,
    assignments: [],
    workspaces: [],
    notices: [],
    emails: [],
    dataCatalog: null,
    sync: {
      lastStartedAt: null,
      lastCompletedAt: null,
      lastRunAt: null,
      lastSuccessAt: null,
      lastError: null,
      sources: {},
      domains: {},
      runId: null,
    },
    settings: {
      apiPort: 8765,
      syncIntervalMinutes: 30,
      autoSync: false,
      openOriginalInApp: true,
      academicAuthMode: 'api',
      academicApiEnabled: false,
      mail: { enabled: false, pollIntervalMinutes: 5 },
      modelBaseUrl: '',
      modelProvider: 'openai-compatible',
      modelName: '',
      modelModels: [],
      modelRouting: {
        advisorFastModel: null,
        advisorDeepModel: null,
        courseworkModel: null,
        fallbackModel: null,
      },
      advisorConfig: {
        budgetLevel: 'high',
        permissionMode: 'read-only',
        reasoningEffort: 'medium',
        responseStyle: 'balanced',
        responseLength: 'adaptive',
        temperature: 1,
      },
    },
  };
  Object.assign(state, empty);

  if (fragments.has('state/meta')) {
    const meta = fragments.get('state/meta');
    if (meta && typeof meta === 'object') {
      state.appVersion = meta.appVersion || state.appVersion;
      state.createdAt = meta.createdAt || state.createdAt;
      state.updatedAt = meta.updatedAt || state.updatedAt;
    }
  }
  if (fragments.has('state/profile')) state.profile = fragments.get('state/profile');
  if (fragments.has('state/settings')) state.settings = { ...state.settings, ...fragments.get('state/settings') };
  if (fragments.has('state/sync')) state.sync = { ...state.sync, ...fragments.get('state/sync') };
  if (fragments.has('academic/terms')) state.terms = fragments.get('academic/terms') || [];
  if (fragments.has('academic/courses')) state.courses = fragments.get('academic/courses') || [];
  if (fragments.has('academic/schedule')) state.schedule = fragments.get('academic/schedule') || [];
  if (fragments.has('academic/exams')) state.exams = fragments.get('academic/exams') || [];
  if (fragments.has('academic/grades')) state.grades = fragments.get('academic/grades') || [];
  if (fragments.has('academic/selected-courses')) state.selectedCourses = fragments.get('academic/selected-courses') || [];
  if (fragments.has('academic/progress')) state.academicProgress = fragments.get('academic/progress');
  if (fragments.has('academic/extras')) state.academicExtras = fragments.get('academic/extras');
  if (fragments.has('academic/plan-document')) state.academicPlanDocument = fragments.get('academic/plan-document');
  if (fragments.has('coursework/assignments')) state.assignments = fragments.get('coursework/assignments') || [];
  if (fragments.has('coursework/workspaces')) state.workspaces = fragments.get('coursework/workspaces') || [];
  if (fragments.has('communication/notices')) state.notices = fragments.get('communication/notices') || [];
  if (fragments.has('communication/emails')) state.emails = fragments.get('communication/emails') || [];
  if (fragments.has('catalog/index')) state.dataCatalog = fragments.get('catalog/index');

  return state;
}

// Simple hash for content-addressed fragment storage
// Uses Web Crypto API in browser, fallback to basic string hash
export async function digest(value) {
  const json = JSON.stringify(value);
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(json);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // Fallback: simple hash (not cryptographically secure but OK for dedup)
    let h = 0;
    for (let i = 0; i < json.length; i++) {
      const c = json.charCodeAt(i);
      h = ((h << 5) - h) + c;
      h = h & h; // Convert to 32bit integer
    }
    return Math.abs(h).toString(16).padStart(8, '0');
  }
}

export function generateRevision() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
