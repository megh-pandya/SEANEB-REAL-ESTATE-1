import { authApi, refreshSession } from "@/lib/auth/apiClient";
import { clearAccessToken } from "@/lib/auth/refreshHandler";
import { getAccessToken } from "@/lib/auth/tokenStorage";
import { getCookie, removeCookie } from "@/lib/core/cookies";
import { ssoDebugLog } from "@/lib/observability/ssoDebug";
import { getAuthUserStateSnapshot } from "@/services/user.service";

const AUTH_CHANGE_EVENT = "seaneb:auth-changed";
const LOGOUT_IN_PROGRESS_KEY = "seaneb_logout_in_progress";
export const AUTH_LOGOUT_STORAGE_KEY = "seaneb:auth-logout";
const AUTH_FAILURE_STATUS = new Set([401, 403]);
const AUTH_FAILURE_CODES = new Set([
  "USER_NOT_FOUND",
  "AUTH_USER_NOT_FOUND",
  "INVALID_SESSION",
  "SESSION_INVALID",
  "INVALID_REFRESH_TOKEN",
  "REFRESH_TOKEN_INVALID",
  "REFRESH_TOKEN_EXPIRED",
  "AUTH_FAILED",
  "AUTH_INVALID",
  "USER_DATA_MISSING",
  "DB_USER_MISSING",
  "NO_USER",
]);
const AUTH_FAILURE_SKIP_CODES = new Set([
  "OTP_INVALID",
  "OTP_RATE_LIMITED",
  "BRIDGE_TOKEN_REPLAYED",
]);
const AUTH_FAILURE_MESSAGE_PATTERNS = [
  /user\s+not\s+found/i,
  /no\s+user/i,
  /user\s+missing/i,
  /invalid\s+session/i,
  /session\s+invalid/i,
  /invalid\s+refresh/i,
  /refresh\s+token/i,
  /token\s+expired/i,
  /auth(entication)?\s+failed/i,
  /database.*user/i,
  /user\s+data.*missing/i,
];
const AUTH_FAILURE_SKIP_MESSAGE_PATTERNS = [
  /invalid\s*otp/i,
  /otp\s+invalid/i,
  /otp\s+expired/i,
  /otp\s+must/i,
  /bridge\s+token.*replay/i,
];
const AUTH_STORAGE_PREFIX = "property:volatile:";
const DEFAULT_COOKIE_DOMAIN =
  String(process.env.NODE_ENV || "").trim() === "production" ? ".seaneb.com" : "";
const AUTH_STORAGE_KEYS = [
  "otp_context",
  "otp_in_progress",
  "otp_cc",
  "otp_mobile",
  "post_otp_verified",
  "mobile_otp_until",
  "email_otp_until",
  "profile_completed",
  "business_registered",
  "business_onboarding_resume",
  "business_id",
  "branch_id",
  "business_name",
  "business_type",
  "business_location",
  "verified_email",
  "user_email",
  "seaneb_id",
  "auth_return_to",
  "seaneb_sso_exchange_result",
];

const CLIENT_SESSION_KEYS = [
  "post_otp_verified",
  "profile_completed",
  "business_registered",
  "business_onboarding_resume",
  "business_id",
  "branch_id",
  "business_name",
  "business_type",
  "business_location",
  "verified_email",
  "user_email",
  "seaneb_id",
  "otp_cc",
  "otp_mobile",
  "otp_in_progress",
  "mobile_otp_until",
  "email_otp_until",
  "auth_return_to",
];

const removeStorageKey = (storage, key) => {
  try {
    storage.removeItem(key);
  } catch {
    // ignore storage errors
  }
};

const hasAuthHint = () => {
  const token = String(getAccessToken() || "").trim();
  if (token) return true;
  if (typeof document === "undefined") return false;
  return Boolean(
    String(getCookie("csrf_token_property") || "").trim() ||
      String(getCookie("refresh_token_property") || "").trim()
  );
};

export const clearClientSessionArtifacts = () => {
  clearAccessToken();

  for (const key of CLIENT_SESSION_KEYS) {
    removeCookie(key, { path: "/" });
  }

  if (typeof window === "undefined") return;

  const storageKeys = [
    ...CLIENT_SESSION_KEYS,
    ...CLIENT_SESSION_KEYS.map((key) => `property:volatile:${key}`),
  ];
  for (const key of storageKeys) {
    removeStorageKey(window.localStorage, key);
    removeStorageKey(window.sessionStorage, key);
  }
};

const extractAuthFailureDetails = (error = {}, payload = null) => {
  const status = Number(error?.response?.status || error?.status || payload?.status || 0);
  const data = error?.response?.data ?? error?.data ?? payload ?? {};
  const code = String(data?.error?.code || data?.code || data?.errorCode || "").trim();
  const message = String(
    data?.error?.message || data?.message || error?.message || ""
  ).trim();

  return { status, code, message };
};

export const shouldClearAuthOnError = (error = {}, payload = null) => {
  const { status, code, message } = extractAuthFailureDetails(error, payload);
  const lowerCode = code.toUpperCase();

  if (AUTH_FAILURE_SKIP_CODES.has(lowerCode)) return false;
  if (AUTH_FAILURE_SKIP_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))) return false;

  if (AUTH_FAILURE_STATUS.has(status)) return true;
  if (AUTH_FAILURE_CODES.has(lowerCode)) return true;
  if (AUTH_FAILURE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))) return true;

  return false;
};

export const checkAuthenticatedSession = async () => {
  if (!hasAuthHint()) {
    return false;
  }

  try {
    await authApi.me({ retryOn401: false });
    notifyAuthChanged();
    return true;
  } catch (error) {
    const status = Number(error?.status || 0);
    if (status !== 401 && status !== 403) {
      return false;
    }
  }

  try {
    const refreshed = await refreshSession();
    if (!refreshed) return false;
  } catch {
    return false;
  }

  try {
    await authApi.me({ retryOn401: false });
    notifyAuthChanged();
    return true;
  } catch {
    return false;
  }
};

export const guardDashboardNavigation = async ({
  onAuthenticated,
  onUnauthenticated,
} = {}) => {
  const validationState = await validateSessionForDashboardNavigation();
  const isAuthenticated = validationState === true;
  if (isAuthenticated) {
    if (typeof onAuthenticated === "function") {
      await onAuthenticated();
    }
    return true;
  }

  if (typeof onUnauthenticated === "function") {
    await onUnauthenticated();
  }
  return false;
};

export const validateSessionForDashboardNavigation = async () => {
  const snapshot = getAuthUserStateSnapshot();
  const isLocallyAuthenticated = snapshot?.status === "authenticated";

  // Always validate with backend before dashboard navigation.
  // Local auth snapshot can be stale across tabs after registration/login/logout.
  const hasServerSession = await checkAuthenticatedSession();
  if (!hasServerSession && isLocallyAuthenticated) {
    notifyAuthChanged();
  }
  return hasServerSession;
};

export const clearAuthSessionCookies = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
};

const AUTH_COOKIE_SEEDS = [
  "access_token",
  "access_token_property",
  "accessToken",
  "refresh_token_property",
  "refresh_token",
  "refreshToken",
  "refreshToken_property",
  "property_refresh_token",
  "refreshtoken",
  "csrf_token_property",
  "property_csrf_token",
  "csrf_token",
  "csrfToken",
  "csrf-token",
  "XSRF-TOKEN",
  "xsrf-token",
  "XSRF_TOKEN",
  "_csrf",
  "csrftoken",
  "auth_session",
  "auth_session_start",
  "auth_redirect_in_progress",
];

const AUTH_COOKIE_PREFIXES = [
  "access_token",
  "refresh_token",
  "csrf_token",
  "xsrf",
  "csrftoken",
  "auth_session",
];

const collectAuthCookieNames = () => {
  const names = new Set(AUTH_COOKIE_SEEDS);
  if (typeof document === "undefined") return Array.from(names);

  const pairs = String(document.cookie || "").split("; ");
  for (const pair of pairs) {
    if (!pair) continue;
    const index = pair.indexOf("=");
    if (index < 0) continue;
    const rawName = decodeURIComponent(pair.slice(0, index));
    const lower = rawName.trim().toLowerCase();
    if (!lower) continue;
    if (AUTH_COOKIE_PREFIXES.some((prefix) => lower === prefix || lower.startsWith(prefix))) {
      names.add(rawName);
    }
  }

  return Array.from(names);
};

const forceExpireCookie = (name, domain = "") => {
  if (typeof document === "undefined") return;
  const isSecure = window.location.protocol === "https:";
  const sameSite = isSecure ? "None" : "Lax";
  const securePart = isSecure ? "; Secure" : "";
  const base = `${encodeURIComponent(name)}=; path=/; max-age=0; SameSite=${sameSite}${securePart}`;
  document.cookie = base;
  if (domain) {
    document.cookie = `${base}; domain=${domain}`;
  }
};

const forceDeleteAuthCookies = () => {
  if (typeof window === "undefined") return;
  const configuredDomain = DEFAULT_COOKIE_DOMAIN;
  const host = String(window.location.hostname || "").toLowerCase();
  const maybeParentDomain = host.includes(".") ? `.${host.split(".").slice(-2).join(".")}` : "";
  const domains = Array.from(new Set(["", configuredDomain, maybeParentDomain].filter(Boolean)));
  const cookieNames = collectAuthCookieNames();

  for (const name of cookieNames) {
    for (const domain of domains) {
      forceExpireCookie(name, domain);
    }
  }
};

export const clearAuthFailureArtifacts = () => {
  forceDeleteAuthCookies();
  clearClientSessionArtifacts();

  if (typeof window === "undefined") return;

  const clearKey = (storage, key) => {
    try {
      storage.removeItem(key);
    } catch {
      // ignore storage errors
    }
  };

  for (const key of AUTH_STORAGE_KEYS) {
    clearKey(window.localStorage, key);
    clearKey(window.sessionStorage, key);
    clearKey(window.localStorage, `${AUTH_STORAGE_PREFIX}${key}`);
    clearKey(window.sessionStorage, `${AUTH_STORAGE_PREFIX}${key}`);
  }
};
export const logoutAndClearAuthSession = async () => {
  ssoDebugLog("logout.initiated", { route: "/api/auth/logout" });
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(LOGOUT_IN_PROGRESS_KEY, "1");
    } catch {
      // ignore storage errors
    }
  }
  let canClearClientState = false;
  try {
    await authApi.logout();
    canClearClientState = true;
  } catch (error) {
    const status = Number(error?.status || 0);
    if (status === 401 || status === 403) {
      canClearClientState = true;
    } else {
      throw error;
    }
  } finally {
    if (canClearClientState) {
      forceDeleteAuthCookies();
      clearClientSessionArtifacts();
      clearAuthSessionCookies();
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(AUTH_LOGOUT_STORAGE_KEY, String(Date.now()));
        } catch {
          // ignore storage errors
        }
      }
      ssoDebugLog("logout.completed", { route: "/api/auth/logout" });
    }
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(LOGOUT_IN_PROGRESS_KEY);
      } catch {
        // ignore storage errors
      }
    }
  }
  return canClearClientState;
};

export const notifyAuthChanged = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
};

export const subscribeAuthState = (callback) => {
  if (typeof window === "undefined") return () => {};
  const listener = () => callback();
  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      callback();
    }
  };

  window.addEventListener(AUTH_CHANGE_EVENT, listener);
  window.addEventListener("focus", listener);
  window.addEventListener("visibilitychange", onVisibility);

  return () => {
    window.removeEventListener(AUTH_CHANGE_EVENT, listener);
    window.removeEventListener("focus", listener);
    window.removeEventListener("visibilitychange", onVisibility);
  };
};

export {
  authApi,
  apiJson,
  apiRequest,
  refreshSession,
  refreshSessionAndGetProfile,
  setAuthFailureHandler,
} from "@/lib/auth/apiClient";
