import { NextResponse } from "next/server";

const REFRESH_COOKIE_KEYS = [
  "refresh_token_property",
  "refresh_token",
  "refreshToken",
  "refreshToken_property",
  "property_refresh_token",
  "refreshtoken",
  "refreshtoken_property",
];

const CSRF_COOKIE_KEYS = [
  "csrf_token_property",
  "csrf_token",
  "csrfToken",
  "csrfToken_property",
  "property_csrf_token",
  "csrf-token",
  "csrftoken",
  "xsrf-token",
  "x-xsrf-token",
  "XSRF-TOKEN",
  "X-XSRF-TOKEN",
  "XSRF_TOKEN",
  "_csrf",
];

const toBool = (value) => {
  if (value === true) return true;
  if (value === false || value == null) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
};

const readProfilePayload = (payload) => {
  const profile =
    payload?.data?.profile ||
    payload?.data?.user ||
    payload?.data ||
    payload?.profile ||
    payload?.user ||
    payload;
  return profile && typeof profile === "object" ? profile : null;
};

const hasBusinessFromProfile = (profile) => {
  const data = profile || {};

  if (toBool(data.is_business_registered)) return true;
  if (toBool(data.has_business) || toBool(data.business_registered) || toBool(data.is_business)) {
    return true;
  }
  if (typeof data.business_count === "number" && data.business_count > 0) return true;

  if (
    data.business_id ||
    data.business_uuid ||
    data.branch_id ||
    data.branch_uuid ||
    data.broker_id ||
    data.company_id
  ) {
    return true;
  }

  if (Array.isArray(data.businesses) && data.businesses.length > 0) return true;
  if (Array.isArray(data.user_businesses) && data.user_businesses.length > 0) return true;
  if (Array.isArray(data.branches) && data.branches.length > 0) return true;
  if (Array.isArray(data.user_branches) && data.user_branches.length > 0) return true;

  return false;
};

const hasAnyCookie = (request, names = []) =>
  names.some((name) => Boolean(String(request.cookies.get(name)?.value || "").trim()));

const hasSessionCookie = (request) => hasAnyCookie(request, REFRESH_COOKIE_KEYS);
const hasCsrfCookie = (request) => hasAnyCookie(request, CSRF_COOKIE_KEYS);

// Throttle refresh attempts to prevent rapid-fire token consumption on multiple hard refreshes
const MIDDLEWARE_REFRESH_THROTTLE_MS = Number(
  3000
);
const SESSION_FETCH_TIMEOUT_MS = 4000;
const AUTH_APP_PROXY_PATHS = new Set([
  "/auth/login",
  "/auth/business-register",
  "/auth/business-reg",
  "/auth/complete-profile",
]);

// Per-request throttle via cookie (safe for serverless and multi-instance)
const isRecentlyValidated = (request) => {
  const lastAt = Number(request.cookies.get("_mw_refresh_at")?.value || 0);
  return Date.now() - lastAt < MIDDLEWARE_REFRESH_THROTTLE_MS;
};

const setValidatedCookie = (response) => {
  response.cookies.set({
    name: "_mw_refresh_at",
    value: String(Date.now()),
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: Math.ceil(MIDDLEWARE_REFRESH_THROTTLE_MS / 1000),
  });
};

const getSetCookieLines = (headers) => {
  const getSetCookie = headers?.getSetCookie;
  if (typeof getSetCookie === "function") {
    return (getSetCookie.call(headers) || []).filter(Boolean);
  }
  const combined = String(headers?.get("set-cookie") || "").trim();
  if (!combined) return [];
  return combined
    .split(/,(?=\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+=)/g)
    .map((item) => item.trim())
    .filter(Boolean);
};

const getRequestProtocol = (request) => {
  const forwarded = String(request?.headers?.get("x-forwarded-proto") || "").trim().toLowerCase();
  if (forwarded) return forwarded;
  return String(request?.nextUrl?.protocol || "").replace(":", "").trim().toLowerCase();
};

const getRequestHost = (request) => {
  const forwardedHost = String(request?.headers?.get("x-forwarded-host") || "").trim();
  if (forwardedHost) return forwardedHost.split(",")[0].trim();

  const hostHeader = String(request?.headers?.get("host") || "").trim();
  if (hostHeader) return hostHeader;

  return String(request?.nextUrl?.host || request?.nextUrl?.hostname || "").trim();
};

const normalizeHost = (host) => String(host || "").trim().replace(/:\d+$/, "").toLowerCase();

const isLoopbackOrIp = (host) => {
  const value = normalizeHost(host);
  if (!value) return false;
  if (value === "localhost" || value === "::1" || /^127(?:\.\d{1,3}){3}$/.test(value)) return true;
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) return true;
  return value.includes(":"); // IPv6
};

const normalizeBaseUrl = (value) => String(value || "").trim().replace(/\/+$/, "");

const getExternalRequestOrigin = (request) => {
  const protocol = getRequestProtocol(request) || "http";
  const host = getRequestHost(request);
  if (!host) return String(request?.nextUrl?.origin || "").trim();
  return `${protocol}://${host}`;
};

const getExternalRequestUrl = (request) => {
  const origin = getExternalRequestOrigin(request);
  try {
    return new URL(
      `${request?.nextUrl?.pathname || "/"}${request?.nextUrl?.search || ""}`,
      origin || request?.url || "http://localhost"
    ).toString();
  } catch {
    return String(request?.url || "").trim();
  }
};

const resolveCrossAppBaseUrl = (rawUrl, request) => {
  const normalized = normalizeBaseUrl(rawUrl);
  if (!normalized) return "";

  try {
    const targetUrl = new URL(normalized);
    const requestHost = normalizeHost(getRequestHost(request));
    const targetHost = normalizeHost(targetUrl.hostname);

    if (requestHost && requestHost !== targetHost && isLoopbackOrIp(targetHost)) {
      const requestProtocol = getRequestProtocol(request);
      if (requestProtocol) targetUrl.protocol = `${requestProtocol}:`;
      targetUrl.hostname = requestHost;
    }

    return normalizeBaseUrl(targetUrl.toString());
  } catch {
    return normalized;
  }
};

const buildCrossAppUrl = (rawUrl, request, path = "/") => {
  const baseUrl = resolveCrossAppBaseUrl(rawUrl, request);
  if (!baseUrl) return "";
  const safePath = String(path || "").trim() || "/";
  try {
    return new URL(safePath, `${baseUrl}/`).toString();
  } catch {
    return "";
  }
};

const rewriteSetCookieForMiddleware = (cookie, request) => {
  const isSecure = getRequestProtocol(request) === "https";
  const host = normalizeHost(
    request?.headers?.get("x-forwarded-host") || request?.headers?.get("host") || ""
  );

  const parts = String(cookie || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!parts.length) return cookie;

  const nameValue = parts[0];
  const attrs = [];
  let domain = "";
  let sameSite = "";
  let hasSecure = false;

  for (const attr of parts.slice(1)) {
    const [rawKey, ...rest] = attr.split("=");
    const key = String(rawKey || "").trim().toLowerCase();
    const value = rest.join("=").trim();

    if (key === "domain") { domain = value; continue; }
    if (key === "samesite") { sameSite = value; continue; }
    if (key === "secure") { hasSecure = true; continue; }
    attrs.push(attr);
  }

  // Drop domain on loopback/IP hosts
  if (domain && !isLoopbackOrIp(host)) {
    const safeDomain = domain.replace(/^\./, "").toLowerCase();
    if (host === safeDomain || host.endsWith(`.${safeDomain}`)) {
      attrs.push(`Domain=${domain}`);
    }
  }

  // Fix SameSite: None requires Secure; on plain HTTP use Lax
  let finalSameSite = sameSite;
  if (!isSecure && String(sameSite || "").toLowerCase() === "none") {
    finalSameSite = "Lax";
  }
  if (finalSameSite) {
    attrs.push(`SameSite=${finalSameSite}`);
  }

  if (isSecure && (hasSecure || String(finalSameSite || "").toLowerCase() === "none")) {
    attrs.push("Secure");
  }

  return [nameValue, ...attrs].join("; ");
};

const appendSetCookieHeaders = (targetResponse, sourceHeaders) => {
  for (const cookie of getSetCookieLines(sourceHeaders)) {
    targetResponse.headers.append("set-cookie", cookie);
  }
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = SESSION_FETCH_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const getValidatedSessionState = async (request) => {
  try {
    const response = await fetchWithTimeout(new URL("/api/auth/me", request.url), {
      method: "GET",
      headers: {
        cookie: String(request.headers.get("cookie") || ""),
        "x-product-key": String(process.env.NEXT_PUBLIC_PRODUCT_KEY || "property").trim() || "property",
      },
      cache: "no-store",
    });
    if (!response) {
      return { authenticated: false, hasBusiness: false, setCookies: [] };
    }

    const setCookies = getSetCookieLines(response.headers);

    if (response.ok) {
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      const profile = readProfilePayload(payload);
      return {
        authenticated: true,
        hasBusiness: hasBusinessFromProfile(profile || {}),
        setCookies,
      };
    }

    // If /api/auth/me returned non-200, it may have attempted refresh internally.
    // Return the setCookies so any refresh cookies are still forwarded to browser.
    return { authenticated: false, hasBusiness: false, setCookies };
  } catch {
    return { authenticated: false, hasBusiness: false, setCookies: [] };
  }
};

const tryRefreshSession = async (request) => {
  try {
    return await fetch(new URL("/api/auth/refresh", request.url), {
      method: "POST",
      headers: {
        cookie: String(request.headers.get("cookie") || ""),
        "x-product-key": String(process.env.NEXT_PUBLIC_PRODUCT_KEY || "property").trim() || "property",
      },
      cache: "no-store",
    });
  } catch {
    return null;
  }
};

const redirectToAuthLogin = (request) => {
  const authLoginTarget = buildCrossAppUrl(process.env.NEXT_PUBLIC_APP_URL, request, "/auth/login");
  const returnTo = getExternalRequestUrl(request);
  if (!authLoginTarget) {
    const fallbackLoginUrl = new URL("/auth/login", request.url);
    fallbackLoginUrl.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(fallbackLoginUrl, { status: 307 });
  }

  const loginUrl = new URL(authLoginTarget);
  loginUrl.searchParams.set("returnTo", returnTo);
  return NextResponse.redirect(loginUrl, { status: 307 });
};

export async function middleware(request) {
  const pathname = request.nextUrl.pathname;
  if (AUTH_APP_PROXY_PATHS.has(pathname)) {
    const proxyTarget = buildCrossAppUrl(
      process.env.NEXT_PUBLIC_APP_URL,
      request,
      `${pathname}${request.nextUrl.search}`
    );
    if (proxyTarget && proxyTarget !== request.nextUrl.href) {
      return NextResponse.redirect(proxyTarget, { status: 307 });
    }
  }

  const hasRefreshCookie = hasSessionCookie(request);
  const hasCsrfSessionHint = hasCsrfCookie(request);

  // Fast-path: if no session hints, avoid calling /api/auth/me
  if (!hasRefreshCookie && !hasCsrfSessionHint) {
    return redirectToAuthLogin(request);
  }

  // Phase 1: Validate session with /api/auth/me (which attempts refresh internally)
  // Throttle: skip full validation if a recent refresh already occurred (rapid F5 protection)
  const isThrottled = isRecentlyValidated(request);

  let sessionState;
  if (isThrottled && (hasRefreshCookie || hasCsrfSessionHint)) {
    // Trust that the recent refresh is still valid; let client-side auth handle restoration
    sessionState = { authenticated: true, hasBusiness: true, setCookies: [] };
  } else {
    sessionState = await getValidatedSessionState(request);
  }

  let hasSession = sessionState.authenticated;
  const hasBusiness = sessionState.hasBusiness;
  let sessionSetCookies = sessionState.setCookies || [];

  // Phase 2: Refresh is already attempted inside /api/auth/me route handler.
  // An additional refresh attempt here would consume a single-use token,
  // causing the auth flow to break. We rely on /api/auth/me's internal refresh.

  // Phase 3: Build response
  let response = null;

  if (!hasSession) {
    response = redirectToAuthLogin(request);
  }

  if (!response && !hasBusiness) {
    const registerTarget = buildCrossAppUrl(
      process.env.NEXT_PUBLIC_APP_URL,
      request,
      "/auth/business-register"
    );
    if (registerTarget) {
      const registerUrl = new URL(registerTarget);
      registerUrl.searchParams.set("returnTo", getExternalRequestUrl(request));
      response = NextResponse.redirect(registerUrl, { status: 307 });
    } else {
      const localRegisterUrl = new URL("/home", request.url);
      response = NextResponse.redirect(localRegisterUrl, { status: 307 });
    }
  }

  if (!response) {
    response = NextResponse.next();
  }

  if (hasSession) {
    setValidatedCookie(response);
  }

  // Phase 4: Propagate Set-Cookie headers from /api/auth/me response,
  // rewritten for the current request context (HTTP vs HTTPS, Domain matching)
  if (sessionSetCookies.length) {
    for (const cookie of sessionSetCookies) {
      response.headers.append("set-cookie", rewriteSetCookieForMiddleware(cookie, request));
    }
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/auth/:path*"],
};
