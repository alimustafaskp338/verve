const TOKEN_STORAGE_KEY = 'verve_jwt_token';

let memoryToken: string | null = null;

export function getAuthToken(): string | null {
  if (memoryToken) return memoryToken;
  try {
    const saved = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (saved) {
      memoryToken = saved;
      return saved;
    }
  } catch {
    // localStorage may be disabled or blocked
  }
  return null;
}

export function setAuthToken(token: string | null): void {
  memoryToken = token;
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data: T | null; error: string | null; status: number }> {
  try {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    // Attach JWT Authorization header if available
    const token = getAuthToken();
    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(endpoint, {
      ...options,
      headers,
      credentials: 'include',
    });

    const status = res.status;
    let data = null;
    let error = null;

    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const json = await res.json();
      if (!res.ok) {
        error = json.message || json.error || `Request failed with status ${status}`;
      } else {
        data = json;
      }
    } else {
      const text = await res.text();
      if (!res.ok) {
        error = text || `Request failed with status ${status}`;
      }
    }

    return { data, error, status };
  } catch (err: any) {
    return { data: null, error: err.message || 'Network error occurred', status: 0 };
  }
}

export function formatTimeAgo(dateStr: string): string {
  try {
    const date = new Date(dateStr.replace(' ', 'T') + 'Z');
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (isNaN(diffSec) || diffSec < 0) return 'just now';
    if (diffSec < 60) return `${Math.max(1, diffSec)}s`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d`;
    const diffWeek = Math.floor(diffDay / 7);
    if (diffWeek < 52) return `${diffWeek}w`;
    return date.toLocaleDateString();
  } catch {
    return dateStr;
  }
}
