// HTTP-клиент: JWT в httpOnly cookie + CSRF double-submit header.
const API = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api';

export function getCsrf(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown) {
    super(typeof detail === 'string' ? detail : `HTTP ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { json?: unknown; form?: FormData } = {},
): Promise<T> {
  const { json, form, headers, ...rest } = options;
  const h = new Headers(headers);
  const method = (rest.method ?? 'GET').toUpperCase();
  if (method !== 'GET') h.set('X-CSRF-Token', getCsrf() ?? '');
  let body: BodyInit | undefined;
  if (form) body = form;
  else if (json !== undefined) {
    h.set('Content-Type', 'application/json');
    body = JSON.stringify(json);
  }
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    ...rest,
    headers: h,
    body,
  });
  // refresh-ротация: один повтор при 401 на защищённых путях
  if (res.status === 401 && !path.startsWith('/auth/') && !path.startsWith('/superadmin/login')) {
    const r = await request<{ ok: boolean }>('/auth/refresh', { method: 'POST' });
    if (r.ok) return request<T>(path, options);
  }
  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, json?: unknown) => request<T>(p, { method: 'POST', json }),
  patch: <T>(p: string, json?: unknown) => request<T>(p, { method: 'PATCH', json }),
  del: <T>(p: string) => request<T>(p, { method: 'DELETE' }),
  upload: <T>(p: string, form: FormData) => request<T>(p, { method: 'POST', form }),
  url: (p: string) => `${API}${p}`,
};
