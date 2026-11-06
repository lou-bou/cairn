import type { ApiErrorBody } from '@cairn/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

const SESSION_EXPIRED = 'Your session expired. Reload the page to sign in again.';

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      // The API never redirects, but Cloudflare Access does when the session has expired. Following
      // it to the login domain fails like a network error, so catch it here instead.
      redirect: 'manual',
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection.");
  }
  if (res.type === 'opaqueredirect') throw new ApiError(401, SESSION_EXPIRED);
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON (e.g. a proxy error page) */
  }
  if (!res.ok) {
    const err = (data ?? {}) as Partial<ApiErrorBody>;
    if (res.status === 401 || res.status === 403) {
      throw new ApiError(res.status, SESSION_EXPIRED);
    }
    throw new ApiError(res.status, err.error ?? `Request failed (${res.status})`, err.fields);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
};

export function qs(params: Record<string, string | number | undefined | null>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : '';
}
