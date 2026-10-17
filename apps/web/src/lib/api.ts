const BASE = import.meta.env.VITE_API_URL || '/api';

export function token() { return localStorage.getItem('gs_token') || ''; }
export function setToken(t: string) { t ? localStorage.setItem('gs_token', t) : localStorage.removeItem('gs_token'); }

async function req(path: string, opts: RequestInit = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...(opts.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as any).message || (body as any).error || `HTTP ${res.status}`);
  return body;
}

export const api = {
  get: (p: string) => req(p),
  post: (p: string, b?: unknown) => req(p, { method: 'POST', body: JSON.stringify(b || {}) }),
  put: (p: string, b?: unknown) => req(p, { method: 'PUT', body: JSON.stringify(b || {}) }),
  patch: (p: string, b?: unknown) => req(p, { method: 'PATCH', body: JSON.stringify(b || {}) }),
  login: (email: string, password: string) => req('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
};
export const inr = (n: number | string) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
