import { NextResponse } from "next/server";
import { API_REMOTE_BASE_URL, API_REMOTE_FALLBACK_BASE_URL } from "@/lib/core/apiBaseUrl";
import { createHash } from "node:crypto";
import { getCookieOptions } from "@/lib/auth/cookieOptions";

const PRODUCT_KEY = String(process.env.NEXT_PUBLIC_PRODUCT_KEY || "property").trim() || "property";
const BRIDGE_REPLAY_CACHE_TTL_MS = 2 * 60_000;
const bridgeReplayCache = new Map();
const tokenDigest = (value) =>
  createHash("sha256").update(String(value || ""), "utf8").digest("hex");

const cleanupReplayCache = () => {
  const now = Date.now();
  for (const [digest, expiresAt] of bridgeReplayCache.entries()) {
    if (expiresAt <= now) {
      bridgeReplayCache.delete(digest);
    }
  }
};

const appendSetCookieHeaders = (targetHeaders, upstreamHeaders) => {
  const getSetCookie = upstreamHeaders?.getSetCookie;
  if (typeof getSetCookie === "function") {
    const cookies = getSetCookie.call(upstreamHeaders) || [];
    for (const cookie of cookies) {
      if (!cookie) continue;
      if (/^\s*access_token=/i.test(cookie)) continue;
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

  for (const cookie of splitCookies) {
    if (/^\s*access_token=/i.test(cookie)) continue;
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
  const loweredCandidates = candidateNames.map((name) => String(name || "").trim().toLowerCase());
  for (const raw of setCookieHeaders) {
    const firstPair = String(raw || "").split(";")[0] || "";
    const idx = firstPair.indexOf("=");
    if (idx < 0) continue;
    const name = firstPair.slice(0, idx).trim();
    const value = firstPair.slice(idx + 1).trim();
    if (!name || !value) continue;
    if (!loweredCandidates.includes(name.toLowerCase())) continue;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return "";
};

const readAccessTokenFromPayload = (payload = {}, headers = null) => {
  const data = payload?.data || {};
  const tokenObj = data?.token || payload?.token || {};
  const headerAuth = String(
    headers?.get("authorization") ||
      headers?.get("Authorization") ||
      ""
  ).trim();
  const headerToken = /^bearer\s+/i.test(headerAuth)
    ? headerAuth.replace(/^bearer\s+/i, "").trim()
    : headerAuth;

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
      ""
  ).trim();
};

const readRefreshTokenFromPayload = (payload = {}) => {
  const data = payload?.data || {};
  const tokenObj = data?.token || payload?.token || {};
  return String(
    payload?.refreshToken ||
      payload?.refresh_token ||
      data?.refreshToken ||
      data?.refresh_token ||
      tokenObj?.refreshToken ||
      tokenObj?.refresh_token ||
      ""
  ).trim();
};

const readCsrfFromPayload = (payload = {}, headers = null) => {
  const data = payload?.data || {};
  return String(
    payload?.csrfToken ||
      payload?.csrf_token ||
      data?.csrfToken ||
      data?.csrf_token ||
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
  const loweredCandidates = candidateNames.map((name) => String(name || "").trim().toLowerCase());
  for (const raw of setCookieHeaders) {
    const firstPair = String(raw || "").split(";")[0] || "";
    const idx = firstPair.indexOf("=");
    if (idx < 0) continue;
    const name = firstPair.slice(0, idx).trim().toLowerCase();
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

const readAuthAppBaseUrl = () => {
  const raw = String(process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (!raw) return "";
  return raw.replace(/\/+$/, "");
};

const buildUpstreamCandidates = () => {
  const bases = Array.from(
    new Set([API_REMOTE_BASE_URL, API_REMOTE_FALLBACK_BASE_URL].filter(Boolean))
  );

  const urls = [];
  for (const base of bases) {
    const normalized = String(base || "").trim().replace(/\/+$/, "");
    if (!normalized) continue;

    let hasApiV1 = false;
    let hasV1 = false;
    let origin = "";

    try {
      const parsed = new URL(normalized);
      origin = String(parsed.origin || "").trim().replace(/\/+$/, "");
      const path = String(parsed.pathname || "").replace(/\/+$/, "");
      hasApiV1 = /\/api\/v1$/i.test(path);
      hasV1 = /\/v1$/i.test(path);
    } catch {
      // Non-URL base; fall back to simple candidates.
    }

    urls.push(`${normalized}/sso/exchange`);
    urls.push(`${normalized}/auth/sso/exchange`);
    if (!hasApiV1 && !hasV1) {
      urls.push(`${normalized}/v1/sso/exchange`);
    }

    if (origin) {
      urls.push(`${origin}/api/v1/sso/exchange`);
      urls.push(`${origin}/v1/sso/exchange`);
      urls.push(`${origin}/auth/sso/exchange`);
      urls.push(`${origin}/sso/exchange`);
    }
  }

  return urls;
};

const tryExchangeUpstream = async ({ headers, body }) => {
  const candidates = buildUpstreamCandidates();
  if (!candidates.length) return null;

  let lastResponse = null;
  for (const upstreamUrl of candidates) {
    try {
      const response = await fetch(upstreamUrl, {
        method: "POST",
        headers,
        body,
        cache: "no-store",
      });
      lastResponse = response;
      const status = Number(response.status || 0);
      if (status >= 500) {
        // Try next candidate if upstream is unhealthy.
        continue;
      }
      if (status !== 404 && status !== 405) {
        return response;
      }
    } catch {
      // try next candidate
    }
  }

  return lastResponse;
};

export async function POST(request) {
  const cookieOptions = getCookieOptions(request);
  cleanupReplayCache();
  let payload = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const bridgeToken = String(
    payload?.bridge_token || payload?.bridgeToken || ""
  ).trim();

  if (!bridgeToken) {
    return NextResponse.json(
      {
        error: {
          code: "BRIDGE_TOKEN_REQUIRED",
          message: "bridge_token is required",
        },
      },
      { status: 400 }
    );
  }

  const digest = tokenDigest(bridgeToken);
  if (bridgeReplayCache.has(digest)) {
    return NextResponse.json(
      {
        error: {
          code: "BRIDGE_TOKEN_REPLAYED",
          message: "bridge_token already exchanged",
        },
      },
      { status: 409 }
    );
  }
  // Mark as in-flight to block concurrent replay attempts.
  bridgeReplayCache.set(digest, Date.now() + BRIDGE_REPLAY_CACHE_TTL_MS);

  const incomingCookie = String(request.headers.get("cookie") || "").trim();
  const headers = new Headers();
  headers.set("content-type", "application/json");
  headers.set("x-product-key", PRODUCT_KEY);
  if (incomingCookie) headers.set("cookie", incomingCookie);

  const body = JSON.stringify({
    bridge_token: bridgeToken,
    target_product_key: PRODUCT_KEY,
    product_key: PRODUCT_KEY,
  });

  const upstreamResponse = await tryExchangeUpstream({ headers, body });
  if (!upstreamResponse) {
    bridgeReplayCache.delete(digest);
    return NextResponse.json(
      {
        error: {
          code: "UPSTREAM_SSO_EXCHANGE_UNAVAILABLE",
          message: "Unable to reach SSO exchange upstream",
        },
      },
      { status: 502 }
    );
  }

  let upstreamPayload = {};
  try {
    upstreamPayload = await upstreamResponse.json();
  } catch {
    upstreamPayload = {};
  }

  const responseHeaders = new Headers();
  appendSetCookieHeaders(responseHeaders, upstreamResponse.headers);

  if (!upstreamResponse.ok) {
    const authAppBase = readAuthAppBaseUrl();
    if (authAppBase) {
      try {
        const fallbackUrl = `${authAppBase}/api/auth/exchange-bridge-token`;
        const fallbackResponse = await fetch(fallbackUrl, {
          method: "POST",
          headers,
          body,
          cache: "no-store",
        });

        let fallbackPayload = {};
        try {
          fallbackPayload = await fallbackResponse.json();
        } catch {
          fallbackPayload = {};
        }

        const fallbackHeaders = new Headers();
        appendSetCookieHeaders(fallbackHeaders, fallbackResponse.headers);

        if (fallbackResponse.ok) {
          const fallbackSetCookies = getSetCookieList(fallbackResponse.headers);
          const accessToken =
            readAccessTokenFromPayload(fallbackPayload, fallbackResponse.headers) ||
            readCookieValueFromSetCookieHeaders(fallbackSetCookies, ["access_token", "accessToken"]);
          const refreshToken =
            readRefreshTokenFromPayload(fallbackPayload) ||
            readCookieValueFromSetCookieHeaders(fallbackSetCookies, [
              "refresh_token_property",
              "refresh_token",
              "refreshToken_property",
              "refreshToken",
              "property_refresh_token",
            ]);
          const csrfToken =
            readCsrfFromPayload(fallbackPayload, fallbackResponse.headers) ||
            readCookieValueFromSetCookieHeaders(fallbackSetCookies, [
              "csrf_token_property",
              "csrf_token",
              "csrfToken",
            ]);
          const expiresIn = readExpiresInFromPayload(fallbackPayload);
          const refreshCookieAttrs = readCookieAttributesFromSetCookieHeaders(
            fallbackSetCookies,
            ["refresh_token_property", "refresh_token", "refreshToken_property", "refreshToken", "property_refresh_token"]
          );
          const csrfCookieAttrs = readCookieAttributesFromSetCookieHeaders(
            fallbackSetCookies,
            ["csrf_token_property", "csrf_token", "csrfToken"]
          );
          const refreshMaxAgeFromJwt = refreshToken ? readJwtExpirySeconds(refreshToken) : null;
          const refreshExpiry = buildExpiryOptions({
            maxAgeSeconds: refreshCookieAttrs.maxAge ?? refreshMaxAgeFromJwt ?? null,
            expiresAt: refreshCookieAttrs.expires || null,
          });
          const csrfExpiry = buildExpiryOptions({
            maxAgeSeconds: csrfCookieAttrs.maxAge ?? refreshMaxAgeFromJwt ?? expiresIn ?? null,
            expiresAt: csrfCookieAttrs.expires || null,
          });

          const response = NextResponse.json(
            {
              success: true,
              ...(accessToken ? { accessToken, access_token: accessToken } : {}),
            },
            {
              status: 200,
              headers: fallbackHeaders,
            }
          );

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

          response.cookies.delete("access_token");
          return response;
        }
      } catch {
        // fall through to return upstream error
      }
    }

    bridgeReplayCache.delete(digest);
    const message = String(
      upstreamPayload?.error?.message || upstreamPayload?.message || "SSO exchange failed"
    ).trim();
    return NextResponse.json(
      {
        error: {
          code: String(upstreamPayload?.error?.code || upstreamPayload?.code || "SSO_EXCHANGE_FAILED"),
          message,
        },
      },
      {
        status: Number(upstreamResponse.status || 400),
        headers: responseHeaders,
      }
    );
  }

  const upstreamSetCookies = getSetCookieList(upstreamResponse.headers);
  const accessToken =
    readAccessTokenFromPayload(upstreamPayload, upstreamResponse.headers) ||
    readCookieValueFromSetCookieHeaders(upstreamSetCookies, ["access_token", "accessToken"]);
  const refreshToken =
    readRefreshTokenFromPayload(upstreamPayload) ||
    readCookieValueFromSetCookieHeaders(upstreamSetCookies, [
      "refresh_token_property",
      "refresh_token",
      "refreshToken_property",
      "refreshToken",
      "property_refresh_token",
    ]);
  const csrfToken =
    readCsrfFromPayload(upstreamPayload, upstreamResponse.headers) ||
    readCookieValueFromSetCookieHeaders(upstreamSetCookies, [
      "csrf_token_property",
      "csrf_token",
      "csrfToken",
    ]);
  const expiresIn = readExpiresInFromPayload(upstreamPayload);
  const refreshCookieAttrs = readCookieAttributesFromSetCookieHeaders(
    upstreamSetCookies,
    ["refresh_token_property", "refresh_token", "refreshToken_property", "refreshToken", "property_refresh_token"]
  );
  const csrfCookieAttrs = readCookieAttributesFromSetCookieHeaders(
    upstreamSetCookies,
    ["csrf_token_property", "csrf_token", "csrfToken"]
  );
  const refreshMaxAgeFromJwt = refreshToken ? readJwtExpirySeconds(refreshToken) : null;
  const refreshExpiry = buildExpiryOptions({
    maxAgeSeconds: refreshCookieAttrs.maxAge ?? refreshMaxAgeFromJwt ?? null,
    expiresAt: refreshCookieAttrs.expires || null,
  });
  const csrfExpiry = buildExpiryOptions({
    maxAgeSeconds: csrfCookieAttrs.maxAge ?? refreshMaxAgeFromJwt ?? expiresIn ?? null,
    expiresAt: csrfCookieAttrs.expires || null,
  });

  const response = NextResponse.json(
    {
      success: true,
      ...(accessToken ? { accessToken, access_token: accessToken } : {}),
    },
    {
      status: 200,
      headers: responseHeaders,
    }
  );

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

  response.cookies.delete("access_token");

  return response;
}




