import { useEffect, useState } from "react";
import { bridge } from "../bridge";
import type { GithubUpdateStatus, TheiaBridge } from "../types";

type UpdateHookOptions = {
  /** The app shell owns the one automatic check; secondary views only subscribe. */
  autoCheck?: boolean;
};

type AutomaticCheckRecord = {
  startedAt: number;
  promise: Promise<GithubUpdateStatus | null>;
  settled: boolean;
};

// React StrictMode and the About page can mount more than once during startup.
// Keep this guard at module scope so those mounts cannot create duplicate GitHub
// requests. A page reload starts a new lifecycle and may check again.
const automaticChecks = new WeakMap<TheiaBridge, AutomaticCheckRecord>();
const AUTOMATIC_CHECK_GUARD_MS = 60_000;

function startAutomaticCheck() {
  const now = Date.now();
  const existing = automaticChecks.get(bridge);
  if (
    existing &&
    (!existing.settled || now - existing.startedAt < AUTOMATIC_CHECK_GUARD_MS)
  ) {
    return existing.promise;
  }

  const record: AutomaticCheckRecord = {
    startedAt: now,
    promise: Promise.resolve(null),
    settled: false,
  };
  record.promise = bridge.checkForUpdates()
    .catch(() => null)
    .finally(() => {
      record.settled = true;
    });
  automaticChecks.set(bridge, record);
  return record.promise;
}

export function defaultGithubUpdateStatus(currentVersion = "web"): GithubUpdateStatus {
  return {
    supported: false,
    state: "unsupported",
    installPermissionRequired: false,
    currentVersion: currentVersion || "web",
    availableVersion: null,
    releaseName: null,
    releaseDate: null,
    lastCheckedAt: null,
    progress: null,
    updateSizeBytes: null,
    error: null,
  };
}

export function useGithubUpdateStatus(currentVersion = "web", options: UpdateHookOptions = {}) {
  const [status, setStatus] = useState<GithubUpdateStatus>(() =>
    defaultGithubUpdateStatus(currentVersion),
  );

  useEffect(() => {
    let active = true;
    const unsubscribe = bridge.onUpdateStatus?.((next) => {
      if (active) setStatus(next);
    });

    const sync = async () => {
      try {
        const next = await bridge.getUpdateStatus();
        if (active) setStatus(next);

        const updateInProgress = ["checking", "available", "downloading", "downloaded"]
          .includes(next.state);
        if (options.autoCheck && next.supported && !next.installPermissionRequired && !updateInProgress) {
          // The mobile checker uses its 24-hour local cache. The bridge guard
          // additionally prevents duplicate checks from StrictMode/remounts.
          await startAutomaticCheck();
        }
      } catch {
        if (active) setStatus(defaultGithubUpdateStatus(currentVersion));
      }
    };
    void sync();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [currentVersion, options.autoCheck]);

  return status;
}
