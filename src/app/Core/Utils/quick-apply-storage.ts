// Jobs this browser quick-applied to, so the button shows "sent" without an account too.
// The API is the real record (it refuses a second application); this only saves a round trip.
const KEY = 'quick_apply_jobs';
const MAX = 500;

function read(): number[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((id) => Number.isInteger(id)) : [];
  } catch {
    return [];
  }
}

export function hasQuickApplied(jobId: number): boolean {
  return read().includes(jobId);
}

export function rememberQuickApplied(jobId: number): void {
  try {
    const ids = read().filter((id) => id !== jobId);
    ids.push(jobId);
    localStorage.setItem(KEY, JSON.stringify(ids.slice(-MAX)));
  } catch {
    // Private mode / storage full: the API still refuses a duplicate
  }
}

/** The address quick apply can send to: the API's, or null when there is none (apply on the source site). */
export function quickApplyEmail(job: { applyEmail?: string | null } | null | undefined): string | null {
  return job?.applyEmail || null;
}
