// Stage-0 mock campus data from desktop demo.ts (serialized to JSON).
// This module re-hydrates the mock state with fresh timestamps so demo
// items always appear current.
import demoState from './mock-data.json' with { type: 'json' };

function isoAfter(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export function createMockState() {
  const state = structuredClone(demoState);
  state.appVersion = '0.5.1-mobile';
  const now = new Date().toISOString();
  state.createdAt = now;
  state.updatedAt = now;
  state.sync = {
    lastStartedAt: null,
    lastCompletedAt: null,
    lastRunAt: null,
    lastSuccessAt: null,
    lastError: null,
    sources: {},
    domains: {},
    runId: null,
  };
  // Refresh relative timestamps so demo items look fresh
  if (state.exams && state.exams.length) {
    state.exams[0].examTime = isoAfter(120);
    state.exams[0].startAt = isoAfter(120);
    state.exams[1].examTime = isoAfter(240);
    state.exams[1].startAt = isoAfter(240);
  }
  if (state.assignments && state.assignments.length) {
    state.assignments[0].dueAt = isoAfter(30);
    state.assignments[1].dueAt = isoAfter(54);
    state.assignments[2].dueAt = isoAfter(80);
  }
  if (state.notices && state.notices.length) {
    state.notices[0].publishedAt = isoAfter(-10);
    state.notices[1].publishedAt = isoAfter(-18);
  }
  return state;
}

export const mockState = createMockState();
