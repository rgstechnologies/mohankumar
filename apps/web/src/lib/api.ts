'use client';

/**
 * API client. Authentication rides on httpOnly cookies set by the server —
 * no tokens are ever stored in JavaScript-readable storage, so XSS cannot
 * steal a session. A lightweight (non-sensitive) flag remembers that a
 * login happened, purely to skip a useless round-trip on first paint.
 */

/**
 * Resolve the API origin at RUNTIME so a packaged desktop/mobile build can be
 * pointed at any backend without a rebuild: a native shell may inject
 * `window.__API_URL__`, or persist `sa.apiUrl`. Falls back to the build-time
 * env (used by the web app + demo).
 */
function apiUrl(): string {
  if (typeof window !== 'undefined') {
    const injected = (window as { __API_URL__?: string }).__API_URL__;
    if (injected) return injected;
    try {
      const stored = localStorage.getItem('sa.apiUrl');
      if (stored) return stored;
    } catch {
      /* localStorage unavailable — fall through */
    }
  }
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
}

const base = (): string => `${apiUrl()}/api/v1`;

/**
 * Native shells (Electron/Capacitor) can't carry the httpOnly auth cookie across
 * their custom origin, so they authenticate with Bearer tokens. The web app
 * stays on cookies — no token is ever placed in JS-readable storage there.
 */
function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as {
    __APP_NATIVE__?: boolean;
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  return w.__APP_NATIVE__ === true || w.Capacitor?.isNativePlatform?.() === true;
}

const ACCESS_TOKEN = 'sa.at';
const REFRESH_TOKEN = 'sa.rt';

function readToken(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storeTokens(t: { accessToken?: string; refreshToken?: string }): void {
  try {
    if (t.accessToken) localStorage.setItem(ACCESS_TOKEN, t.accessToken);
    if (t.refreshToken) localStorage.setItem(REFRESH_TOKEN, t.refreshToken);
  } catch {
    /* ignore */
  }
}
function clearTokens(): void {
  try {
    localStorage.removeItem(ACCESS_TOKEN);
    localStorage.removeItem(REFRESH_TOKEN);
  } catch {
    /* ignore */
  }
}

/** Bearer header for native sessions; empty for the cookie-based web app. */
function authHeaders(): Record<string, string> {
  const at = isNative() ? readToken(ACCESS_TOKEN) : null;
  return at ? { Authorization: `Bearer ${at}` } : {};
}

const AUTH_FLAG = 'sa.auth';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** True when this browser has (or recently had) a session. */
export function isAuthenticated(): boolean {
  return typeof window !== 'undefined' && localStorage.getItem(AUTH_FLAG) === '1';
}

function setAuthFlag(on: boolean): void {
  if (on) localStorage.setItem(AUTH_FLAG, '1');
  else localStorage.removeItem(AUTH_FLAG);
}

async function tryRefresh(): Promise<boolean> {
  const native = isNative();
  const res = await fetch(`${base()}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    // Web: the refresh token rides the httpOnly cookie. Native: send it from
    // the token store (no cookie to lean on across the app origin).
    body: native ? JSON.stringify({ refreshToken: readToken(REFRESH_TOKEN) }) : '{}',
  });
  if (!res.ok) {
    setAuthFlag(false);
    if (native) clearTokens();
    return false;
  }
  if (native) {
    try {
      storeTokens(await res.json());
    } catch {
      /* no JSON body — cookie mode */
    }
  }
  return true;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = { ...authHeaders() };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${base()}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && retry && (await tryRefresh())) {
    return request<T>(method, path, body, false);
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      message = Array.isArray(data.message)
        ? data.message.join(', ')
        : (data.message ?? message);
    } catch {
      // non-JSON error body — keep default message
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

/** Downloads an authenticated API resource as a file (exports, PDFs). */
export async function downloadFile(path: string): Promise<void> {
  const res = await fetch(`${base()}${path}`, {
    credentials: 'include',
    headers: authHeaders(),
  });
  if (!res.ok) throw new ApiError(res.status, `Download failed (${res.status})`);

  const disposition = res.headers.get('Content-Disposition') ?? '';
  const fileName =
    /filename="([^"]+)"/.exec(disposition)?.[1] ?? path.split('/').pop() ?? 'download';

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * POST a JSON body and return an object URL for the rendered PDF, for embedding
 * in an <iframe> (e.g. an inline live layout preview). Caller must revoke the URL.
 */
export async function previewPdfBlob(path: string, body: unknown): Promise<string> {
  const res = await fetch(`${base()}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, `Preview failed (${res.status})`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/** POST a JSON body and open the returned PDF in a new tab (e.g. layout preview). */
export async function openPdfPost(path: string, body: unknown): Promise<void> {
  // Open the tab synchronously, while we still hold the user-gesture context —
  // popup blockers block window.open() called after an await, which is why a
  // second preview (e.g. after a Save) silently failed to open.
  const win = typeof window !== 'undefined' ? window.open('about:blank', '_blank') : null;
  try {
    const res = await fetch(`${base()}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new ApiError(res.status, `Preview failed (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if (win) win.location.href = url;
    else window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    win?.close();
    throw err;
  }
}

/**
 * Fetch a PDF (auth cookies included) and open the browser print dialog for it.
 * Renders into a hidden iframe and calls print(); falls back to a new tab if the
 * browser blocks programmatic printing.
 */
export async function printFile(path: string): Promise<void> {
  const res = await fetch(`${base()}${path}`, {
    credentials: 'include',
    headers: authHeaders(),
  });
  if (!res.ok) throw new ApiError(res.status, `Print failed (${res.status})`);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.src = url;
  document.body.appendChild(iframe);

  const cleanup = () => {
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      URL.revokeObjectURL(url);
    }, 60_000);
  };

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      window.open(url, '_blank');
    }
    cleanup();
  };
}

// ---- Typed endpoints used by the UI ----

export interface AuthResult {
  user: { id: string; email: string; name: string };
  /** Present for native (Bearer) clients; the web app authenticates via cookies. */
  accessToken?: string;
  refreshToken?: string;
}

export interface Membership {
  role: string;
  company: { id: string; name: string; gstin: string | null; stateCode: string | null };
}

export interface SubscriptionSummary {
  planCode: string;
  planName: string;
  status: 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  expiresAt: string | null;
  daysLeft: number | null;
  maxCompanies: number;
  companiesOwned: number;
  maxBranches: number;
  maxMembers: number;
  features: Record<string, boolean>;
}

export interface Me {
  id: string;
  email: string;
  phone?: string | null;
  name: string;
  accountType?: 'BUSINESS' | 'AUDITOR';
  isSuperAdmin: boolean;
  totpEnabled: boolean;
  subscription: SubscriptionSummary;
  memberships: Membership[];
}

export interface MfaChallenge {
  mfaRequired: true;
  mfaToken: string;
}

export async function login(
  identifier: string,
  password: string,
): Promise<AuthResult | MfaChallenge> {
  const result = await api.post<AuthResult | MfaChallenge>('/auth/login', {
    identifier,
    password,
  });
  if (!('mfaRequired' in result)) {
    setAuthFlag(true);
    if (isNative()) storeTokens(result);
  }
  return result;
}

export async function mfaVerifyLogin(
  mfaToken: string,
  code: string,
): Promise<AuthResult> {
  const result = await api.post<AuthResult>('/auth/mfa/verify', { mfaToken, code });
  setAuthFlag(true);
  if (isNative()) storeTokens(result);
  return result;
}

export const mfaSetup = () =>
  api.post<{ secret: string; otpauthUri: string; qrDataUrl: string }>('/auth/mfa/setup');

export const mfaEnable = (code: string) =>
  api.post<{ enabled: boolean; recoveryCodes: string[] }>('/auth/mfa/enable', { code });

export const mfaDisable = (code: string) =>
  api.post<{ enabled: boolean }>('/auth/mfa/disable', { code });

export async function register(
  name: string,
  email: string,
  phone: string,
  password: string,
  accountType: 'BUSINESS' | 'AUDITOR' = 'BUSINESS',
): Promise<AuthResult> {
  const result = await api.post<AuthResult>('/auth/register', {
    name,
    email,
    phone,
    password,
    accountType,
  });
  setAuthFlag(true);
  if (isNative()) storeTokens(result);
  return result;
}

export async function logout(): Promise<void> {
  const body = isNative() ? { refreshToken: readToken(REFRESH_TOKEN) } : {};
  await api.post('/auth/logout', body).catch(() => undefined);
  setAuthFlag(false);
  clearTokens();
}

export const forgotPassword = (email: string) =>
  api.post('/auth/forgot-password', { email });

export const resetPassword = (token: string, password: string) =>
  api.post('/auth/reset-password', { token, password });
