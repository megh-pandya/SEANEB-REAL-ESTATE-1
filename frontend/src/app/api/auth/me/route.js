import { NextResponse } from "next/server";
import { API_REMOTE_BASE_URL } from "@/lib/core/apiBaseUrl";
import { getCookieOptions, sanitizeCookieDomain } from "@/lib/auth/cookieOptions";

const PRODUCT_KEY =
  String(process.env.NEXT_PUBLIC_PRODUCT_KEY || "").trim() || "property";
const DEFAULT_COOKIE_DOMAIN =
  String(process.env.NODE_ENV || "").trim() === "production" ? ".seaneb.com" : "";
const normalizeProductKey = (value) =>
  String(value || "").trim() || PRODUCT_KEY;

const REFRESH_COOKIE_KEYS = [
  "refresh_token_property",
  "refresh_token",
  "refreshToken",
  "refreshToken_property",
  "property_refresh_token",
  "refreshtoken",
  "refreshtoken_property",
];
const ACCESS_COOKIE_KEYS = [
  "access_token",
  "accessToken",
  "token",
  "auth_session",
  "auth_session_property",
];
const CSRF_COOKIE_KEYS = [
  "csrf_token_property",
  "csrf_token",
  "csrfToken",
  "csrfToken_property",
  "property_csrf_token",
  "csrftoken",
  "csrf-token",
  "xsrf-token",
  "x-xsrf-token",
  "XSRF-TOKEN",
  "X-XSRF-TOKEN",
  "XSRF_TOKEN",
  "_csrf",
];
const CLEAR_AUTH_COOKIE_KEYS = Array.from(
  new Set([...REFRESH_COOKIE_KEYS, ...ACCESS_COOKIE_KEYS, ...CSRF_COOKIE_KEYS])
);

const isValidAuthorizationHeader = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (!/^bearer\s+/i.test(raw)) return false;
  const token = raw.replace(/^bearer\s+/i, "").trim();
  if (!token) return false;
  const lowered = token.toLowerCase();
  return !["cookie_session", "null", "undefined", "invalid", "sentinel"].includes(lowered);
};

const normalizeCookieName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^__(host|secure)-/i, "");

const getRequestHost = (request) =>
  String(request?.headers?.get?.("x-forwarded-host") || request?.headers?.get?.("host") || "")
    .trim();

const normalizeHost = (host) => String(host || "").trim().replace(/:\d+$/, "").toLowerCase();

const isIpHost = (host) => {
  const value = normalizeHost(host);
  if (!value) return false;
  if (value.includes(":")) return true; // IPv6
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value);
};

const isLoopbackHost = (host) => {
  const value = normalizeHost(host);
  return value === "localhost" || value === "::1" || /^127(?:\.\d{1,3}){3}$/.test(value);
};

const domainMatchesHost = (domain, host) => {
  const safeHost = normalizeHost(host);
  const safeDomain = String(domain || "").trim().replace(/^\./, "").toLowerCase();
  if (!safeHost || !safeDomain) return false;
  return safeHost === safeDomain || safeHost.endsWith(`.${safeDomain}`);
};

const normalizeSameSiteValue = (value) => {
  const raw = String(value || "").trim();
  const lowered = raw.toLowerCase();
  if (lowered === "none") return "None";
  if (lowered === "lax") return "Lax";
  if (lowered === "strict") return "Strict";
  return raw || "Lax";
};

const getClearCookieDomains = (request, cookieOptions) => {
  const domains = new Set([""]);
  const host = normalizeHost(getRequestHost(request));

  if (host && !isIpHost(host) && !isLoopbackHost(host)) {
    domains.add(host);
    const maybeParent = host.includes(".") ? `.${host.split(".").slice(-2).join(".")}` : "";
    if (maybeParent) domains.add(maybeParent);
  }

  const configuredDomain = sanitizeCookieDomain(DEFAULT_COOKIE_DOMAIN);
  if (configuredDomain && domainMatchesHost(configuredDomain, host)) {
    domains.add(configuredDomain);
  }
  if (cookieOptions?.domain && domainMatchesHost(cookieOptions.domain, host)) {
    domains.add(cookieOptions.domain);
  }

  return Array.from(domains);
};

const buildExpiredCookieLine = (name, domain, cookieOptions) => {
  const safeName = String(name || "").trim();
  if (!safeName) return "";
  const sameSite = normalizeSameSiteValue(cookieOptions?.sameSite || "Lax");
  const secure = typeof cookieOptions?.secure === "boolean" ? cookieOptions.secure : false;
  const parts = [
    `${safeName}=`,
    "Path=/",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    `SameSite=${sameSite}`,
  ];
  if (domain) parts.push(`Domain=${domain}`);
  if (secure) parts.push("Secure");
  return parts.join("; ");
};

const appendClearAuthCookies = (headers, request, cookieOptions) => {
  const domains = getClearCookieDomains(request, cookieOptions);
  for (const name of CLEAR_AUTH_COOKIE_KEYS) {
    for (const domain of domains) {
      const line = buildExpiredCookieLine(name, domain, cookieOptions);
      if (line) headers.append("set-cookie", line);
    }
  }
};

const hasAuthCookiesInHeader = (cookieHeader) => {
  const source = String(cookieHeader || "").trim();
  if (!source) return false;
  const allowed = new Set(CLEAR_AUTH_COOKIE_KEYS.map(normalizeCookieName));
  const parts = source.split("; ");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const name = normalizeCookieName(part.slice(0, idx));
    if (allowed.has(name)) return true;
  }
  return false;
};

const responseMentionsMissingUser = (text) => {
  const normalized = String(text || "").toLowerCase();
  if (!normalized) return false;
  if (normalized.includes("user_not_found")) return true;
  if (normalized.includes("profile_not_found")) return true;
  if (normalized.includes("account_not_found")) return true;
  if (normalized.includes("user deleted") || normalized.includes("user_deleted")) return true;
  if (normalized.includes("account deleted") || normalized.includes("account_deleted")) return true;
  if (normalized.includes("profile deleted") || normalized.includes("profile_deleted")) return true;
  if (
    normalized.includes("not found") &&
    (normalized.includes("user") || normalized.includes("profile") || normalized.includes("account"))
  ) {
    return true;
  }
  if (
    normalized.includes("does not exist") &&
    (normalized.includes("user") || normalized.includes("profile") || normalized.includes("account"))
  ) {
    return true;
  }
  return false;
};

const getCookieValueFromHeader = (cookieHeader, key) => {
  const source = String(cookieHeader || "");
  if (!source) return "";
  const target = normalizeCookieName(key);
  const parts = source.split("; ");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    const normalizedName = normalizeCookieName(name);
    if (normalizedName !== target) continue;
    return part.slice(idx + 1).trim();
  }
  return "";
};

const hasRefreshCookie = (cookieHeader) => {
  const source = String(cookieHeader || "");
  if (!source) return false;
  const parts = source.split("; ");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const rawName = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!value) continue;
    const name = normalizeCookieName(rawName);
    if (!name) continue;
    if (
      name === "refresh_token_property" ||
      name === "refresh_token" ||
      name === "refreshtoken" ||
      name === "refreshtoken_property" ||
      name === "property_refresh_token" ||
      name.startsWith("refresh_token") ||
      name.includes("refresh_token")
    ) {
      return true;
    }
  }
  return false;
};

const resolveCsrfHeaderValue = (incomingHeader, cookieHeader) => {
  const fromHeader = String(incomingHeader || "").trim();
  if (fromHeader) return fromHeader;

  for (const key of CSRF_COOKIE_KEYS) {
    const fromCookieRaw = getCookieValueFromHeader(cookieHeader, key);
    if (!fromCookieRaw) continue;
    try {
      return decodeURIComponent(fromCookieRaw);
    } catch {
      return fromCookieRaw;
    }
  }
  return "";
};

const readCsrfFromPayload = (payload = {}, headers = null) => {
  const data = payload?.data || {};
  const tokenObj = data?.token || payload?.token || {};
  return String(
    payload?.csrf_token_property ||
      data?.csrf_token_property ||
    payload?.csrfToken ||
      payload?.csrf_token ||
      data?.csrfToken ||
      data?.csrf_token ||
      tokenObj?.csrfToken ||
      tokenObj?.csrf_token ||
      headers?.get("x-csrf-token") ||
      headers?.get("csrf-token") ||
      headers?.get("x-xsrf-token") ||
      ""
  ).trim();
};

const readExpiresInFromPayload = (payload = {}) => {
  const data = payload?.data || {};
  const value = payload?.expiresIn ?? payload?.expires_in ?? data?.expiresIn ?? data?.expires_in;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const readTokenFromPayload = (payload = {}, headers = null) => {
  const data = payload?.data || {};
  const tokenObj = data?.token || payload?.token || {};
  const headerAuth = String(
    headers?.get("authorization") ||
      headers?.get("Authorization") ||
      ""
  ).trim();
  const responseHeaderToken = /^bearer\s+/i.test(headerAuth)
    ? headerAuth.replace(/^bearer\s+/i, "").trim()
    : headerAuth;
  const rawHeader = String(
    payload?.authorization ||
      payload?.Authorization ||
      data?.authorization ||
      data?.Authorization ||
      ""
  ).trim();
  const payloadHeaderToken = /^bearer\s+/i.test(rawHeader)
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
      payloadHeaderToken ||
      responseHeaderToken ||
      ""
  ).trim();
};

const appendSetCookieHeaders = (targetHeaders, upstreamHeaders) => {
  const getSetCookie = upstreamHeaders?.getSetCookie;
  if (typeof getSetCookie === "function") {
    const cookies = getSetCookie.call(upstreamHeaders) || [];
    for (const cookie of cookies) {
      if (!cookie) continue;
      targetHeaders.append("set-cookie", cookie);
    }
    return;
  }
  const combinedCookieHeader = String(upstreamHeaders.get("set-cookie") || "").trim();
  if (!combinedCookieHeader) return;
  const splitCookies = combinedCookieHeader
    .split(/,(?=\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+=)/g)
    .map((item) => item.trim())
    .filter(Boolean);
  if (splitCookies.length === 0) return;
  for (const cookie of splitCookies) {
    targetHeaders.append("set-cookie", cookie);
  }
};

const getSetCookieList = (headers) => {
  const getSetCookie = headers?.getSetCookie;
  if (typeof getSetCookie === "function") {
    return (getSetCookie.call(headers) || []).filter(Boolean);
  }
  const combinedCookieHeader = String(headers?.get("set-cookie") || "").trim();
  if (!combinedCookieHeader) return [];
  return combinedCookieHeader
    .split(/,(?=\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+=)/g)
    .map((item) => item.trim())
    .filter(Boolean);
};

const readCookieValueFromSetCookieHeaders = (setCookieHeaders = [], candidateNames = []) => {
  const loweredCandidates = candidateNames
    .map((name) => normalizeCookieName(name))
    .filter(Boolean);
  for (const raw of setCookieHeaders) {
    const firstPair = String(raw || "").split(";")[0] || "";
    const idx = firstPair.indexOf("=");
    if (idx < 0) continue;
    const name = normalizeCookieName(firstPair.slice(0, idx));
    const value = firstPair.slice(idx + 1).trim();
    if (!name || !value) continue;
    if (!loweredCandidates.includes(name)) continue;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return "";
};

const parseSetCookieAttributes = (cookieLine = "") => {
  const parts = String(cookieLine || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const attrs = { maxAge: null, expires: null };
  for (const attr of parts.slice(1)) {
    const [rawKey, ...rest] = attr.split("=");
    const key = String(rawKey || "").trim().toLowerCase();
    const value = rest.join("=").trim();
    if (key === "max-age") {
      const num = Number(value);
      if (Number.isFinite(num)) attrs.maxAge = num;
    } else if (key === "expires") {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) attrs.expires = date;
    }
  }
  return attrs;
};

const readCookieAttributesFromSetCookieHeaders = (setCookieHeaders = [], candidateNames = []) => {
  const loweredCandidates = candidateNames
    .map((name) => normalizeCookieName(name))
    .filter(Boolean);
  for (const raw of setCookieHeaders) {
    const firstPair = String(raw || "").split(";")[0] || "";
    const idx = firstPair.indexOf("=");
    if (idx < 0) continue;
    const name = normalizeCookieName(firstPair.slice(0, idx));
    if (!loweredCandidates.includes(name)) continue;
    const attrs = parseSetCookieAttributes(raw);
    if (attrs.maxAge != null || attrs.expires) return attrs;
  }
  return { maxAge: null, expires: null };
};

const readJwtExpirySeconds = (token) => {
  try {
    const raw = String(token || "").trim();
    if (!raw) return null;
    const parts = raw.split(".");
    if (parts.length < 2) return null;
    const payloadJson = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const payload = JSON.parse(payloadJson);
    const exp = Number(payload?.exp);
    if (!Number.isFinite(exp)) return null;
    const now = Math.floor(Date.now() / 1000);
    const diff = exp - now;
    return diff > 0 ? diff : null;
  } catch {
    return null;
  }
};

const buildExpiryOptions = ({ maxAgeSeconds = null, expiresAt = null } = {}) => {
  const options = {};
  if (Number.isFinite(maxAgeSeconds)) {
    options.maxAge = Math.max(1, Math.floor(maxAgeSeconds));
    return options;
  }
  if (expiresAt instanceof Date && !Number.isNaN(expiresAt.getTime())) {
    options.expires = expiresAt;
  }
  return options;
};

const mergeCookieHeaderWithSetCookie = (cookieHeader, setCookieHeaders = []) => {
  const cookieMap = new Map();
  const incoming = String(cookieHeader || "");
  if (incoming) {
    for (const part of incoming.split(";")) {
      const segment = String(part || "").trim();
      if (!segment) continue;
      const idx = segment.indexOf("=");
      if (idx < 0) continue;
      const name = segment.slice(0, idx).trim();
      const value = segment.slice(idx + 1).trim();
      if (!name) continue;
      cookieMap.set(name, value);
    }
  }

  for (const setCookie of setCookieHeaders) {
    const firstPair = String(setCookie || "").split(";")[0] || "";
    const idx = firstPair.indexOf("=");
    if (idx < 0) continue;
    const name = firstPair.slice(0, idx).trim();
    const value = firstPair.slice(idx + 1).trim();
    if (!name) continue;
    cookieMap.set(name, value);
  }

  return Array.from(cookieMap.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
};

export async function GET(request) {
  const upstreamCandidates = [
    `${API_REMOTE_BASE_URL}/profile/me`,
    `${API_REMOTE_BASE_URL}/auth/me`,
  ];
  const incomingProductKey = normalizeProductKey(
    request.headers.get("x-product-key") || request.headers.get("X-Product-Key") || PRODUCT_KEY
  );
  const incomingCookie = String(request.headers.get("cookie") || "").trim();
  const hasAuthCookies = hasAuthCookiesInHeader(incomingCookie);
  const hasRefreshCookieInRequest = hasRefreshCookie(incomingCookie);
  const incomingAuthorizationRaw = String(
    request.headers.get("authorization") || request.headers.get("Authorization") || ""
  ).trim();
  const incomingAuthorization = isValidAuthorizationHeader(incomingAuthorizationRaw)
    ? incomingAuthorizationRaw
    : "";
  const incomingCsrfHeader = String(
    request.headers.get("x-csrf-token") ||
      request.headers.get("x-xsrf-token") ||
      request.headers.get("csrf-token") ||
      ""
  ).trim();
  const incomingCsrf = resolveCsrfHeaderValue(incomingCsrfHeader, incomingCookie);

  const headers = new Headers();
  headers.set("x-product-key", incomingProductKey);
  if (incomingAuthorization) headers.set("authorization", incomingAuthorization);
  if (incomingCsrf) headers.set("x-csrf-token", incomingCsrf);
  if (incomingCookie) headers.set("cookie", incomingCookie);
  const cookieBufferHeaders = new Headers();

  let upstreamResponse = null;
  let networkError = null;
  let refreshAttempted = false;
  let refreshSucceeded = false;
  let refreshPayloadForCookies = {};
  for (const upstreamUrl of upstreamCandidates) {
    try {
      let response = await fetch(upstreamUrl, {
        method: "GET",
        headers,
        cache: "no-store",
      });

      // If still unauthorized, attempt upstream refresh using refresh cookie and retry once.
      if (
        !refreshAttempted &&
        hasRefreshCookie(incomingCookie) &&
        [401, 403].includes(Number(response.status || 0))
      ) {
        refreshAttempted = true;
        const refreshHeaders = new Headers();
        refreshHeaders.set("content-type", "application/json");
        refreshHeaders.set("x-product-key", incomingProductKey);
        if (incomingAuthorization) refreshHeaders.set("authorization", incomingAuthorization);
        if (incomingCsrf) refreshHeaders.set("x-csrf-token", incomingCsrf);
        if (incomingCookie) refreshHeaders.set("cookie", incomingCookie);

        let refreshResponse = null;
        try {
          refreshResponse = await fetch(`${API_REMOTE_BASE_URL}/auth/refresh`, {
            method: "POST",
            headers: refreshHeaders,
            body: JSON.stringify({ product_key: incomingProductKey }),
            cache: "no-store",
          });
        } catch {
          refreshResponse = null;
        }

        // CSRF can be stale after cross-app auth hops; retry refresh once without CSRF.
        if (
          refreshResponse &&
          [401, 403].includes(Number(refreshResponse.status || 0)) &&
          incomingCsrf
        ) {
          const noCsrfHeaders = new Headers(refreshHeaders);
          noCsrfHeaders.delete("x-csrf-token");
          try {
            const noCsrfRefresh = await fetch(`${API_REMOTE_BASE_URL}/auth/refresh`, {
              method: "POST",
              headers: noCsrfHeaders,
              body: JSON.stringify({ product_key: incomingProductKey }),
              cache: "no-store",
            });
            if (noCsrfRefresh.ok) {
              refreshResponse = noCsrfRefresh;
            }
          } catch {
            // Keep original refresh response.
          }
        }

        if (refreshResponse) {
          appendSetCookieHeaders(cookieBufferHeaders, refreshResponse.headers);

          if (refreshResponse.ok) {
            refreshSucceeded = true;
            let refreshPayload = {};
            try {
              refreshPayload = await refreshResponse.json();
            } catch {
              refreshPayload = {};
            }
            refreshPayloadForCookies = refreshPayload;

            const refreshSetCookies = getSetCookieList(refreshResponse.headers);
            const refreshedCookieHeader = mergeCookieHeaderWithSetCookie(
              incomingCookie,
              refreshSetCookies
            );
            const refreshedCsrf =
              readCsrfFromPayload(refreshPayload, refreshResponse.headers) ||
              resolveCsrfHeaderValue("", refreshedCookieHeader) ||
              incomingCsrf;
            const refreshedAccessToken = readTokenFromPayload(refreshPayload, refreshResponse.headers);

            const retryHeaders = new Headers(headers);
            if (refreshedCsrf) retryHeaders.set("x-csrf-token", refreshedCsrf);
            if (refreshedAccessToken) retryHeaders.set("authorization", `Bearer ${refreshedAccessToken}`);
            if (refreshedCookieHeader) retryHeaders.set("cookie", refreshedCookieHeader);

            response = await fetch(upstreamUrl, {
              method: "GET",
              headers: retryHeaders,
              cache: "no-store",
            });
          }
        }
      }
      upstreamResponse = response;
      const status = Number(response.status || 0);
      if (status !== 404 && status !== 405) break;
    } catch (err) {
      networkError = err;
      upstreamResponse = null;
    }
  }

  if (!upstreamResponse) {
    return NextResponse.json(
      {
        error: {
          code: "UPSTREAM_AUTH_ME_UNAVAILABLE",
          message: "Unable to reach auth me upstream",
          ...(networkError ? { details: "network_error" } : {}),
        },
      },
      { status: 502 }
    );
  }

  const responseHeaders = new Headers();
  const contentType = upstreamResponse.headers.get("content-type");
  if (contentType) responseHeaders.set("content-type", contentType);
  appendSetCookieHeaders(responseHeaders, cookieBufferHeaders);
  appendSetCookieHeaders(responseHeaders, upstreamResponse.headers);

  const payload = await upstreamResponse.text();
  const cookieOptions = getCookieOptions(request);
  const status = Number(upstreamResponse.status || 0);
  const shouldClearAuth =
    hasRefreshCookieInRequest &&
    !refreshSucceeded &&
    ([401, 403, 404, 410].includes(status) || responseMentionsMissingUser(payload));
  if (shouldClearAuth) {
    appendClearAuthCookies(responseHeaders, request, cookieOptions);
  }

  const response = new NextResponse(payload, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
  try {
    const setCookies = getSetCookieList(responseHeaders);
    const refreshToken = readCookieValueFromSetCookieHeaders(setCookies, [
      "refresh_token_property",
      "refresh_token",
      "refreshToken_property",
      "refreshToken",
      "property_refresh_token",
    ]);
    const csrfToken = readCookieValueFromSetCookieHeaders(setCookies, [
      "csrf_token_property",
      "csrf_token",
      "csrfToken",
    ]);
    const expiresIn = readExpiresInFromPayload(refreshPayloadForCookies);
    const refreshCookieAttrs = readCookieAttributesFromSetCookieHeaders(setCookies, [
      "refresh_token_property",
      "refresh_token",
      "refreshToken_property",
      "refreshToken",
      "property_refresh_token",
    ]);
    const csrfCookieAttrs = readCookieAttributesFromSetCookieHeaders(setCookies, [
      "csrf_token_property",
      "csrf_token",
      "csrfToken",
    ]);
    const refreshMaxAgeFromJwt = refreshToken ? readJwtExpirySeconds(refreshToken) : null;
    const refreshExpiry = buildExpiryOptions({
      maxAgeSeconds: refreshCookieAttrs.maxAge ?? refreshMaxAgeFromJwt ?? null,
      expiresAt: refreshCookieAttrs.expires || null,
    });
    const csrfExpiry = buildExpiryOptions({
      maxAgeSeconds: csrfCookieAttrs.maxAge ?? refreshMaxAgeFromJwt ?? expiresIn ?? null,
      expiresAt: csrfCookieAttrs.expires || null,
    });

    if (refreshToken) {
      response.cookies.set({
        name: "refresh_token_property",
        value: refreshToken,
        httpOnly: true,
        sameSite: cookieOptions.sameSite,
        secure: cookieOptions.secure,
        ...(cookieOptions?.domain ? { domain: cookieOptions.domain } : {}),
        path: "/",
        ...refreshExpiry,
      });
    }

    if (csrfToken) {
      response.cookies.set({
        name: "csrf_token_property",
        value: csrfToken,
        httpOnly: false,
        sameSite: cookieOptions.sameSite,
        secure: cookieOptions.secure,
        ...(cookieOptions?.domain ? { domain: cookieOptions.domain } : {}),
        path: "/",
        ...csrfExpiry,
      });
    }
  } catch {
    // best-effort cookie hydration
  }
  return response;
}
