import { API_BASE_URL } from "@/lib/core/apiBaseUrl";
import { ssoDebugLog } from "@/lib/observability/ssoDebug";
import { createRefreshLock } from "@/lib/auth/refreshLock";
import { getSessionHint } from "@/lib/auth/sessionHint";

const ENV_PRODUCT_KEY = String(process.env.NEXT_PUBLIC_PRODUCT_KEY || "").trim();
const DEFAULT_PRODUCT_KEY = ENV_PRODUCT_KEY || "property";
const REFRESH_ENDPOINT = "/auth/refresh";
const CSRF_COOKIE_CANDIDATES = ["csrf_token_property"];
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504, 522, 524]);

// =============== NEW: Configuration (no path changes) ===============
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;
const INVALID_TOKENS = new Set(["cookie_session", "null", "undefined", "invalid", "sentinel"]);
const REFRESH_DEDUP_STORAGE_KEY = "seaneb:refresh_last_at";
const REFRESH_DEDUP_WINDOW_MS = 3000;

let refreshPromise = null;
let lastRefreshStatus = "idle";
let lastRefreshAt = 0;
let lastRefreshHttpStatus = 0;
let lastRefreshError = "";
let authFailureHandler = null;
let authFailurePromise = null;
let inMemoryAccessToken = "";

// =============== NEW: Cookie helpers (no path changes) ===============
const getCookieValue = (name) => {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(new RegExp(`(^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[2]) : "";
};

const wasRecentlyRefreshed = () => {
  if (typeof window === "undefined") return false;
  try {
    const ts = Number(window.sessionStorage.getItem(REFRESH_DEDUP_STORAGE_KEY) || 0);
    return ts > 0 && Date.now() - ts < REFRESH_DEDUP_WINDOW_MS;
  } catch { return false; }
};

const markRefreshCompleted = () => {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.setItem(REFRESH_DEDUP_STORAGE_KEY, String(Date.now())); } catch {}
};

const hasRefreshTokenCookie = () => {
  return Boolean(getCookieValue("refresh_token_property"));
};

const hasCsrfTokenCookie = () => {
  return Boolean(getCookieValue("csrf_token_property"));
};

const hasRefreshSessionHint = async () => {
  if (hasRefreshTokenCookie()) return true;
  const hint = await getSessionHint();
  return Boolean(hint?.hasRefreshSession);
};

// =============== NEW: Cross-origin detection (no path changes) ===============
const isCrossOrigin = () => {
  if (typeof window === "undefined") return false;
  try {
    const apiUrl = new URL(API_BASE_URL);
    return window.location.origin !== apiUrl.origin;
  } catch {
    return false;
  }
};

// Log once on load (no path changes)
if (typeof window !== "undefined") {
  console.log("[refreshHandler] Running in cross-origin mode:", isCrossOrigin());
  console.log("[refreshHandler] Has refresh cookie on load:", hasRefreshTokenCookie());
}

const isUsableAccessToken = (value) => {
  const token = String(value || "").trim();
  if (!token) return false;
  const lowered = token.toLowerCase();
  return !INVALID_TOKENS.has(lowered);
};

const normalizeBaseUrl = (value) => String(value || "").trim().replace(/\/+$/, "");
const RESOLVED_API_BASE_URL = normalizeBaseUrl(API_BASE_URL || "");

const toAbsoluteUrl = (path) => {
  const target = String(path || "").trim();
  if (!target) throw new Error("Missing request path");
  if (/^https?:\/\//i.test(target)) throw new Error("Absolute auth URLs are not allowed");
  if (!target.startsWith("/")) throw new Error(`Path must start with '/': ${target}`);
  return RESOLVED_API_BASE_URL ? `${RESOLVED_API_BASE_URL}${target}` : target;
};

// =============== IMPROVED: Cookie reading with regex (no path changes) ===============
const readCookie = (name) => {
  if (typeof document === "undefined") return "";
  
  // Try regex first (faster)
  try {
    const match = document.cookie.match(new RegExp(`(^|;\\s*)${name}=([^;]*)`));
    if (match) return decodeURIComponent(match[2]);
  } catch {
    // Fall back to manual parsing
  }
  
  // Manual parsing fallback
  const cookies = document.cookie ? document.cookie.split("; ") : [];
  for (const cookie of cookies) {
    const idx = cookie.indexOf("=");
    if (idx < 0) continue;
    const key = decodeURIComponent(cookie.slice(0, idx));
    if (key !== name) continue;
    return decodeURIComponent(cookie.slice(idx + 1));
  }
  return "";
};

const getCsrfToken = () => {
  for (const name of CSRF_COOKIE_CANDIDATES) {
    const value = String(readCookie(name) || "").trim();
    if (value) return value;
  }
  return "";
};

const readAccessTokenFromPayload = (payload = {}, headers = null) => {
  const data = payload?.data || {};
  const tokenObj = data?.token || payload?.token || {};
  const responseAuthHeader = String(
    headers?.get("authorization") ||
      headers?.get("Authorization") ||
      ""
  ).trim();
  const responseHeaderToken = /^bearer\s+/i.test(responseAuthHeader)
    ? responseAuthHeader.replace(/^bearer\s+/i, "").trim()
    : responseAuthHeader;
  const rawHeader = String(
    payload?.authorization ||
      payload?.Authorization ||
      data?.authorization ||
      data?.Authorization ||
      ""
  ).trim();
  const headerToken = /^bearer\s+/i.test(rawHeader)
    ? rawHeader.replace(/^bearer\s+/i, "").trim()
    : rawHeader;

  return String(
    payload?.accessToken ||
      payload?.access_token ||
      data?.accessToken ||
      data?.access_token ||
      tokenObj?.accessToken ||
      tokenObj?.access_token ||
      tokenObj?.token ||
      tokenObj?.jwt ||
      payload?.jwt ||
      data?.jwt ||
      headerToken ||
      responseHeaderToken ||
      ""
  ).trim();
};

const buildRefreshError = (message, status, payload = null) => {
  const error = new Error(String(message || "Refresh failed"));
  error.status = Number(status || 0);
  error.data = payload;
  Error.captureStackTrace?.(error, buildRefreshError);
  return error;
};

const parseRefreshResponse = async (response) => {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return payload;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// =============== IMPROVED: Main refresh function with retry logic (no path changes) ===============
const doRefresh = async (retryCount = 0) => {
  // =============== NEW: Check for refresh token before attempting ===============
  if (!(await hasRefreshSessionHint())) {
    console.log("[refreshHandler] No refresh session detected, cannot refresh");
    lastRefreshStatus = "failed";
    lastRefreshAt = Date.now();
    lastRefreshHttpStatus = 0;
    lastRefreshError = "No refresh session available";
    throw buildRefreshError("No refresh session available", 0, null);
  }

  // Skip if a refresh was just completed (survives hard refresh via sessionStorage)
  if (wasRecentlyRefreshed() && retryCount === 0) {
    console.log("[refreshHandler] Skipping refresh — recently completed (dedup)");
    lastRefreshStatus = "success";
    lastRefreshAt = Date.now();
    return "DEDUP";
  }

  lastRefreshStatus = "pending";
  lastRefreshAt = Date.now();
  lastRefreshHttpStatus = 0;
  lastRefreshError = "";
  ssoDebugLog("refresh.attempt", { route: "/auth/refresh", attempt: retryCount + 1 });

  const csrfToken = getCsrfToken();
  
  const doAttempt = async ({ includeCsrf = true } = {}) => {
    const headers = new Headers({
      "Content-Type": "application/json",
      "x-product-key": DEFAULT_PRODUCT_KEY,
    });
    
    // =============== NEW: Add Origin header for CORS (no path changes) ===============
    if (typeof window !== "undefined") {
      headers.set("Origin", window.location.origin);
    }
    
    if (includeCsrf && csrfToken) {
      headers.set("x-csrf-token", csrfToken);
    }

    const url = toAbsoluteUrl(REFRESH_ENDPOINT);
    
    // Log for debugging (no path changes)
    if (process.env.NODE_ENV === 'development') {
      console.log(`[refreshHandler] Fetching ${url}`, {
        includeCsrf,
        hasCsrf: !!csrfToken,
        cookies: document.cookie,
      });
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      credentials: "include", // CRITICAL for cookies
      cache: "no-store",
      body: JSON.stringify({ product_key: DEFAULT_PRODUCT_KEY }),
    });

    const payload = await parseRefreshResponse(response);
    return { response, payload };
  };

  let attempt = null;
  try {
    attempt = await doAttempt({ includeCsrf: true });
  } catch (networkError) {
    console.error("[refreshHandler] Network error:", networkError);
    
    // =============== NEW: Retry on network errors ===============
    if (retryCount < MAX_RETRIES) {
      console.log(`[refreshHandler] Retrying after network error (${retryCount + 1}/${MAX_RETRIES})...`);
      await sleep(RETRY_DELAY);
      return doRefresh(retryCount + 1);
    }
    
    lastRefreshStatus = "failed";
    lastRefreshAt = Date.now();
    lastRefreshHttpStatus = 0;
    lastRefreshError = String(networkError?.message || "Refresh request failed");
    ssoDebugLog("refresh.failure", { route: "/auth/refresh", status: 0 });
    throw buildRefreshError(lastRefreshError, 0, null);
  }

  let { response, payload } = attempt;

  // Log response for debugging (no path changes)
  if (process.env.NODE_ENV === 'development') {
    console.log(`[refreshHandler] Response status: ${response.status}`);
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      console.log('[refreshHandler] Set-Cookie:', setCookie);
    }
  }

  // Retry without CSRF on auth errors
  if ([401, 403].includes(Number(response.status || 0)) && csrfToken) {
    console.log("[refreshHandler] Auth error, retrying without CSRF");
    try {
      const retryWithoutCsrf = await doAttempt({ includeCsrf: false });
      response = retryWithoutCsrf.response;
      payload = retryWithoutCsrf.payload;
    } catch {
      // Keep the original auth error response.
    }
  }

  // Retry on transient errors with backoff
  if (TRANSIENT_STATUSES.has(Number(response.status || 0))) {
    console.log(`[refreshHandler] Transient error ${response.status}, retrying...`);
    await sleep(200);
    try {
      const transientRetry = await doAttempt({ includeCsrf: false });
      response = transientRetry.response;
      payload = transientRetry.payload;
    } catch {
      // Keep the original transient error response.
    }
  }

  // Handle error responses
  if (!response.ok) {
    const status = Number(response.status || 0);
    
    // =============== NEW: Retry on 5xx errors ===============
    if (status >= 500 && retryCount < MAX_RETRIES) {
      console.log(`[refreshHandler] Server error ${status}, retrying (${retryCount + 1}/${MAX_RETRIES})...`);
      await sleep(RETRY_DELAY * (retryCount + 1)); // Exponential backoff
      return doRefresh(retryCount + 1);
    }
    
    if (status === 401 || status === 403) {
      clearAccessToken();
    }
    
    lastRefreshStatus = "failed";
    lastRefreshAt = Date.now();
    lastRefreshHttpStatus = status;
    lastRefreshError = String(payload?.error?.message || payload?.message || "Refresh failed");
    ssoDebugLog("refresh.failure", { route: "/auth/refresh", status });
    throw buildRefreshError(lastRefreshError, response.status, payload);
  }

  // Extract token from response
  const nextToken = readAccessTokenFromPayload(payload, response.headers);
  
  // =============== NEW: Validate token before setting ===============
  if (nextToken && isUsableAccessToken(nextToken)) {
    setAccessToken(nextToken);
    lastRefreshStatus = "success";
    lastRefreshAt = Date.now();
    lastRefreshHttpStatus = Number(response.status || 200);
    lastRefreshError = "";
    markRefreshCompleted();
    ssoDebugLog("refresh.success", {
      route: "/auth/refresh",
      status: Number(response.status || 200),
      hasAccessToken: true,
    });
    return nextToken;
  }

  // Cookie-session mode: no token returned
  setAccessToken("");
  lastRefreshStatus = "success";
  lastRefreshAt = Date.now();
  lastRefreshHttpStatus = Number(response.status || 200);
  lastRefreshError = "";
  markRefreshCompleted();
  ssoDebugLog("refresh.success", {
    route: "/auth/refresh",
    status: Number(response.status || 200),
    hasAccessToken: false,
  });
  return "COOKIE_SESSION";
};

const _refreshLock = createRefreshLock(async () => doRefresh());

export const getAccessToken = () => String(inMemoryAccessToken || "").trim();

export const setAccessToken = (token) => {
  const safeToken = isUsableAccessToken(token) ? String(token || "").trim() : "";
  inMemoryAccessToken = safeToken;
  return safeToken;
};

export const clearAccessToken = () => {
  inMemoryAccessToken = "";
};

export const refreshAccessToken = async () => {
  if (!(await hasRefreshSessionHint())) {
    console.log("[refreshHandler] No refresh session, skipping refresh");
    // If there is no refresh session, we avoid surfacing this as an error.
    // This prevents noisy warnings from legitimate public/unauthenticated flows.
    lastRefreshStatus = "failed";
    lastRefreshAt = Date.now();
    lastRefreshError = "No refresh session available";
    return null;
  }

  refreshPromise = _refreshLock.run();
  try {
    return await refreshPromise;
  } finally {
    if (!_refreshLock.isRunning()) {
      refreshPromise = null;
    }
  }
};

export const ensureAccessToken = async () => {
  if (getAccessToken()) return true;
  
  if (!(await hasRefreshSessionHint())) {
    console.log("[refreshHandler] No refresh session, cannot ensure token");
    return false;
  }
  
  try {
    await refreshAccessToken();
    return true;
  } catch {
    return false;
  }
};

export const setAuthFailureHandler = (handler) => {
  authFailureHandler = typeof handler === "function" ? handler : null;
};

export const triggerAuthFailure = async () => {
  if (typeof authFailureHandler !== "function") return;
  
  if (!authFailurePromise) {
    authFailurePromise = (async () => {
      try {
        await authFailureHandler();
      } catch (error) {
        console.error("[refreshHandler] Auth failure handler error:", error);
      } finally {
        authFailurePromise = null;
      }
    })();
  }
  
  return authFailurePromise;
};

// =============== IMPROVED: Diagnostics with more info (no path changes) ===============
export const getRefreshDiagnostics = () => ({
  hasAccessTokenInMemory: Boolean(getAccessToken()),
  hasRefreshCookie: hasRefreshTokenCookie(),
  hasCsrfCookie: hasCsrfTokenCookie(),
  refreshInFlight: Boolean(refreshPromise),
  lastRefreshStatus,
  lastRefreshAt,
  lastRefreshHttpStatus,
  lastRefreshError,
  isCrossOrigin: isCrossOrigin(),
  apiBaseUrl: API_BASE_URL,
  productKey: DEFAULT_PRODUCT_KEY,
});

// Log diagnostics on load (no path changes)
if (typeof window !== "undefined") {
  console.log("[refreshHandler] Initial diagnostics:", getRefreshDiagnostics());
}
