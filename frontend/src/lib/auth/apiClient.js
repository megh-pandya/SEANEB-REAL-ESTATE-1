import { API_BASE_URL } from "@/lib/core/apiBaseUrl";
import {
  refreshAccessToken,
  setAuthFailureHandler,
  triggerAuthFailure,
  setAccessToken as setInMemoryAccessToken,
} from "@/lib/auth/refreshHandler";
import {
  getAccessToken,
  clearAccessToken,
} from "@/lib/auth/tokenStorage";
import {
  attachAuthorizationHeader,
  isUsableAccessToken,
  requestWithAuthSafeRetry,
} from "@/lib/auth/apiClientSafe";
import { clearSessionHintCache, getSessionHint } from "@/lib/auth/sessionHint";

const normalizeBaseUrl = (value) => String(value || "").trim().replace(/\/+$/, "");
const RESOLVED_API_BASE_URL = normalizeBaseUrl(API_BASE_URL || "");
const DEFAULT_PRODUCT_KEY = String(process.env.NEXT_PUBLIC_PRODUCT_KEY || "property").trim() || "property";
const LOGOUT_PRODUCT_KEY = DEFAULT_PRODUCT_KEY;

const LOGIN_ENDPOINT = "/auth/login";
const REFRESH_ENDPOINT = "/auth/refresh";
const LOGOUT_ENDPOINT = "/auth/logout";
const ME_ENDPOINT = "/auth/me";

const CSRF_COOKIE_CANDIDATES = [
  "csrf_token_property",
  "csrf_token",
  "csrfToken",
  "csrf-token",
  "XSRF-TOKEN",
  "xsrf-token",
  "XSRF_TOKEN",
  "_csrf",
];

// =============== CROSS-ORIGIN DETECTION ===============
const isCrossOrigin = () => {
  if (typeof window === "undefined") return false;
  try {
    const apiUrl = new URL(API_BASE_URL);
    return window.location.origin !== apiUrl.origin;
  } catch {
    return false;
  }
};

// =============== COOKIE HELPERS ===============
const getCookieValue = (name) => {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(new RegExp(`(^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[2]) : "";
};

const hasRefreshTokenCookie = () => {
  return Boolean(getCookieValue("refresh_token_property"));
};

const hasCsrfTokenCookie = () => {
  return Boolean(getCookieValue("csrf_token_property"));
};

const readCsrfTokenCookie = () => {
  for (const name of CSRF_COOKIE_CANDIDATES) {
    const value = String(getCookieValue(name) || "").trim();
    if (value) return value;
  }
  return "";
};

// Log once on load
if (typeof window !== "undefined") {
  console.log("[API] Running in cross-origin mode:", isCrossOrigin());
  console.log("[API] Has refresh cookie on load:", hasRefreshTokenCookie());
  console.log("[API] Has CSRF cookie on load:", hasCsrfTokenCookie());
}

const toAbsoluteUrl = (path) => {
  const target = String(path || "").trim();
  if (!target) throw new Error("Missing request path");
  if (/^https?:\/\//i.test(target)) throw new Error("Absolute auth URLs are not allowed");
  if (!target.startsWith("/")) throw new Error(`Path must start with '/': ${target}`);
  return RESOLVED_API_BASE_URL ? `${RESOLVED_API_BASE_URL}${target}` : target;
};

// =============== HEADER BUILDER WITH CORS SUPPORT ===============
const buildHeaders = ({ headers }) => {
  const next = attachAuthorizationHeader(headers);
  if (!next.has("Content-Type")) {
    next.set("Content-Type", "application/json");
  }

  next.set("x-product-key", DEFAULT_PRODUCT_KEY);
  
  // Add origin header for CORS (critical for cross-origin requests)
  if (typeof window !== "undefined") {
    next.set("Origin", window.location.origin);
  }

  return next;
};

const normalizeProfilePayload = (profilePayload) =>
  profilePayload?.data || profilePayload?.user || profilePayload || null;

// =============== REFRESH SESSION WITH COOKIE CHECK ===============
export const refreshSession = async () => {
  try {
    await refreshAccessToken();
    return true;
  } catch (error) {
    console.error("[API] Refresh failed:", error);
    clearAccessToken();
    return false;
  }
};

export const refreshSessionAndGetProfile = async () => {
  const refreshed = await refreshSession();
  if (!refreshed) return null;
  const profile = await authApi.me({ retryOn401: false, skipRefresh: true });
  return normalizeProfilePayload(profile);
};

// =============== MAKE ACTUAL FETCH REQUEST ===============
const makeFetchRequest = async (path, options = {}) => {
  const headers = buildHeaders({ headers: options.headers });
  const url = toAbsoluteUrl(path);
  const method = options.method || "GET";
  const methodUpper = String(method).toUpperCase();

  if (!["GET", "HEAD", "OPTIONS"].includes(methodUpper)) {
    const csrfToken = readCsrfTokenCookie();
    if (csrfToken) {
      headers.set("x-csrf-token", csrfToken);
      headers.set("x-xsrf-token", csrfToken);
      headers.set("csrf-token", csrfToken);
    }
  }
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`[API] Making ${method} request to ${path}`, {
      url,
      hasToken: isUsableAccessToken(getAccessToken()),
      hasRefreshCookie: hasRefreshTokenCookie(),
    });
  }
  
  const response = await fetch(url, {
    ...options,
    method,
    headers,
    credentials: "include", // ABSOLUTELY CRITICAL for cookies
    cache: options.cache || "no-store",
  });

  // Extract token from response if present
  if (response.ok) {
    try {
      const authHdr = String(response.headers.get("authorization") || response.headers.get("Authorization") || "").trim();
      if (authHdr) {
        const token = /^Bearer\s+/i.test(authHdr) ? authHdr.replace(/^Bearer\s+/i, "").trim() : authHdr;
        if (token && isUsableAccessToken(token)) {
          setInMemoryAccessToken(token);
        }
      }
    } catch (e) {
      // ignore header parsing errors
    }
  }

  return response;
};

// =============== SPECIAL HANDLER FOR /AUTH/ME ===============
const handleMeRequest = async (path, options = {}, control = {}) => {
  console.log("[API] Handling /auth/me request");
  
  // First try with existing token
  let response = await makeFetchRequest(path, options);
  
  // If 401 and we have a refresh cookie, try refresh once
  if (response.status === 401 && !control._refreshed) {
    console.log("[API] /auth/me returned 401, attempting refresh");
    try {
      await refreshAccessToken();
      control._refreshed = true;
      // Retry with new token
      response = await makeFetchRequest(path, options);
      console.log("[API] /auth/me retry after refresh status:", response.status);
    } catch (refreshError) {
      console.error("[API] Refresh failed for /auth/me:", refreshError);
    }
  }
  
  return response;
};

// =============== MAIN API REQUEST FUNCTION ===============
export const apiRequest = async (path, options = {}, control = {}) => {
  const method = String(options.method || "GET").toUpperCase();
  const isRefreshRequest = String(path || "") === REFRESH_ENDPOINT;
  const isLoginRequest = String(path || "") === LOGIN_ENDPOINT;
  const isMeRequest = String(path || "") === ME_ENDPOINT;
  let hasRetried401 = control._retry === true;
  const retryOn401 = control.retryOn401 !== false && !hasRetried401;
  const requiresAuth = control.requireAuth !== false && !isRefreshRequest && !isLoginRequest;

  // Log auth status for debugging
  if (process.env.NODE_ENV === 'development') {
    console.log(`[API] ${method} ${path}`, {
      hasToken: isUsableAccessToken(getAccessToken()),
      hasRefreshCookie: hasRefreshTokenCookie(),
      hasCsrfCookie: hasCsrfTokenCookie(),
      requiresAuth,
      isRefreshRequest,
      isMeRequest,
      isCrossOrigin: isCrossOrigin(),
    });
  }

  // SPECIAL HANDLING FOR /AUTH/ME
  if (isMeRequest) {
    return handleMeRequest(path, options, control);
  }

  // For non-me requests, try to ensure we have a token
  if (
    requiresAuth &&
    !control.skipRefresh &&
    !isUsableAccessToken(getAccessToken())
  ) {
    try {
      console.log("[API] No access token; attempting refresh");
      await refreshAccessToken();
    } catch (error) {
      console.error("[API] Pre-request refresh failed:", error);
      // Let the actual request run
    }
  }

  const makeRequest = async () => {
    return makeFetchRequest(path, options);
  };

  const response = await requestWithAuthSafeRetry({
    makeRequest,
    retryOn401,
    isRefreshRequest,
    refresh: refreshAccessToken,
    markRetried: () => {
      hasRetried401 = true;
    },
  });

  // Don't trigger auth failure for auth endpoints
  if (response.status !== 401 || !retryOn401 || isRefreshRequest || isMeRequest) {
    return response;
  }

  await triggerAuthFailure();
  return response;
};

// =============== JSON HELPER ===============
export const apiJson = async (path, options = {}, control = {}) => {
  const response = await apiRequest(path, options, control);
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(payload?.message || `HTTP ${response.status}`);
    error.status = response.status;
    error.data = payload;
    throw error;
  }

  return payload;
};

// =============== AUTH API METHODS ===============
export const authApi = {
  login: (credentials) =>
    apiJson(
      LOGIN_ENDPOINT,
      {
        method: "POST",
        body: JSON.stringify({ ...(credentials || {}), product_key: DEFAULT_PRODUCT_KEY }),
      },
      { retryOn401: false }
    ).finally(() => {
      clearSessionHintCache();
    }),
  
  me: (control = {}) => {
    // Don't retry on 401 for /auth/me - we handle it specially
    return apiJson(ME_ENDPOINT, { method: "GET" }, { 
      ...control, 
      retryOn401: false,
      skipRefresh: true // Let our special handler manage refresh
    });
  },

  session: (control = {}) => getSessionHint({ force: control?.force === true }),
  
  exchangeSso: async (bridgeToken) => {
    const response = await fetch("/api/auth/sso/exchange", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        "Origin": typeof window !== "undefined" ? window.location.origin : "",
        "x-product-key": DEFAULT_PRODUCT_KEY,
      },
      body: JSON.stringify({
        bridge_token: String(bridgeToken || "").trim(),
        product_key: DEFAULT_PRODUCT_KEY,
      }),
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }

    if (!response.ok) {
      const error = new Error(
        payload?.error?.message || payload?.message || `HTTP ${response.status}`
      );
      error.status = Number(response.status || 0);
      error.data = payload;
      throw error;
    }

    return payload;
  },
  
  logout: async () => {
    const result = await apiJson(
      LOGOUT_ENDPOINT,
      {
        method: "POST",
        body: JSON.stringify({ product_key: LOGOUT_PRODUCT_KEY }),
      },
      { retryOn401: false }
    );
    clearAccessToken();
    clearSessionHintCache();
    return result;
  },
};

export { setAuthFailureHandler };

if (typeof globalThis !== "undefined" && !globalThis.__SEANEB_AUTH_SAFE_MODE_API_CLIENT_FE__) {
  globalThis.__SEANEB_AUTH_SAFE_MODE_API_CLIENT_FE__ = true;
  console.info("[AUTH SAFE MODE] using shared auth layer");
}

// =============== AXIOS-COMPATIBLE DEFAULT EXPORT ===============
// Create a default export that mimics axios API for backward compatibility
const createAxiosCompatibleApi = () => {
  const api = async (config) => {
    const { method = "GET", url, data, params, headers = {} } = config;
    const path = params ? `${url}?${new URLSearchParams(params)}` : url;
    
    const options = {
      method: method.toUpperCase(),
      headers,
    };
    
    if (data && typeof data === "object") {
      options.body = JSON.stringify(data);
      options.headers["content-type"] = "application/json";
    }
    
    const response = await apiRequest(path, options);
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    
    const result = {
      data: payload,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      config,
    };
    
    if (!response.ok) {
      const error = new Error(payload?.message || `HTTP ${response.status}`);
      error.response = result;
      throw error;
    }
    
    return result;
  };
  
  // Add method shortcuts
  api.get = (url, config = {}) => api({ ...config, method: "GET", url });
  api.post = (url, data, config = {}) => api({ ...config, method: "POST", url, data });
  api.put = (url, data, config = {}) => api({ ...config, method: "PUT", url, data });
  api.patch = (url, data, config = {}) => api({ ...config, method: "PATCH", url, data });
  api.delete = (url, config = {}) => api({ ...config, method: "DELETE", url });
  
  return api;
};

export default createAxiosCompatibleApi();
