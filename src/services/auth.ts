const TOKEN_KEY = 'fleetdock_auth_token';
const USER_KEY = 'fleetdock_auth_user';
const CACHE_OWNER_KEY = 'fleetdock_cache_owner';
const CACHE_KEYS = ['vms', 'containers', 'compose', 'volumes', 'networks', 'mounts', 'fetch_times', 'mount_fetch_times'].map((k) => `fleetdock_${k}`);

export interface AuthUser {
  id: string;
  username: string;
}

// sessionStorage keeps each browser tab/session independent and drops the token when it closes.
export const getToken = (): string | null => sessionStorage.getItem(TOKEN_KEY);

export const getStoredUser = (): AuthUser | null => {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    return getToken() && raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
};

export const clearLocalCache = () => CACHE_KEYS.forEach((k) => localStorage.removeItem(k));

export const storeSession = (token: string, user: AuthUser) => {
  // Cached fleet data belongs to a single user; never show it to someone else.
  if (localStorage.getItem(CACHE_OWNER_KEY) !== user.id) clearLocalCache();
  localStorage.setItem(CACHE_OWNER_KEY, user.id);
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const clearSession = () => {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  clearLocalCache();
  localStorage.removeItem(CACHE_OWNER_KEY);
};

export const UNAUTHORIZED_EVENT = 'fleetdock:unauthorized';

export const authFetch: typeof fetch = async (input, init = {}) => {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401 && token) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  return res;
};
