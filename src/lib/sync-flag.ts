export const SYNC_FAILED_ON_LEAVE_KEY = 'sync_failed_on_leave';

export function markSyncFailedOnLeave(): void {
  try {
    localStorage.setItem(SYNC_FAILED_ON_LEAVE_KEY, 'true');
  } catch {
    // private mode / denied storage
  }
}

export function clearSyncFailedOnLeave(): void {
  try {
    localStorage.removeItem(SYNC_FAILED_ON_LEAVE_KEY);
  } catch {
    // private mode / denied storage
  }
}

export function didSyncFailOnLeave(): boolean {
  try {
    return localStorage.getItem(SYNC_FAILED_ON_LEAVE_KEY) === 'true';
  } catch {
    return false;
  }
}
