// src/main/client.js
import axios from "axios";
import { API_BASE_URL } from "@/lib/core/apiBaseUrl";
import { getAuthAppUrl } from "@/lib/core/appUrls";
import {
  getAccessToken,
  clearAccessToken,
} from "@/lib/auth/tokenStorage";
import {
  refreshAccessToken as refreshAccessTokenShared,
  getRefreshDiagnostics,
} from "@/lib/auth/refreshHandler";
import { clearAuthFailureArtifacts } from "@/services/auth.service";

const DEFAULT_PRODUCT_KEY = "property";
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

const readCsrfToken = () => {
  if (typeof document === "undefined") return "";
  for (const name of CSRF_COOKIE_CANDIDATES) {
    const match = document.cookie.match(new RegExp(`(^|;\\s*)${name}=([^;]*)`));
    if (match && match[2]) {
      try {
        return decodeURIComponent(match[2]);
      } catch {
        return match[2];
      }
    }
  }
  return "";
};

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    "x-product-key": DEFAULT_PRODUCT_KEY,
  },
});

// Request interceptor
api.interceptors.request.use((config) => {
  config.withCredentials = true;
  config.headers = config.headers || {};
  config.headers["x-product-key"] = DEFAULT_PRODUCT_KEY;

  const method = String(config.method || "get").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrfToken = readCsrfToken();
    if (csrfToken) {
      config.headers["x-csrf-token"] = csrfToken;
      config.headers["x-xsrf-token"] = csrfToken;
      config.headers["csrf-token"] = csrfToken;
    }
  }
  
  // Add auth token if available
  const token = getAccessToken();
  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  
  return config;
});

// Response interceptor for token refresh
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error?.config || {};
    const status = error?.response?.status;
    
    // Only handle 401 errors once
    if (status !== 401 || original._retry) {
      return Promise.reject(error);
    }
    
    original._retry = true;
    
    try {
      // Call your actual refresh endpoint
      const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-product-key": DEFAULT_PRODUCT_KEY,
        },
        body: JSON.stringify({ product_key: DEFAULT_PRODUCT_KEY }),
      });
      
      if (!refreshResponse.ok) {
        throw new Error("Refresh failed");
      }
      
      const data = await refreshResponse.json();
      
      // If your API returns a new token, store it
      if (data?.access_token) {
        // You need to implement setAccessToken
        // setAccessToken(data.access_token);
      }
      
      // Retry original request
      return api(original);
    } catch (refreshError) {
      try {
        clearAuthFailureArtifacts();
      } catch {
        clearAccessToken();
      }

      if (typeof window !== "undefined") {
        const loginUrl = new URL(getAuthAppUrl("/auth/login"), window.location.origin);
        const returnTo = String(window.location.href || "").trim();
        if (returnTo) {
          loginUrl.searchParams.set("returnTo", returnTo);
        }
        window.location.assign(loginUrl.toString());
      }
      return Promise.reject(error);
    }
  }
);

export default api;
export const getInMemoryAccessToken = () => getAccessToken();
export const clearInMemoryAccessToken = () => clearAccessToken();
export const refreshAccessToken = (...args) => refreshAccessTokenShared(...args);
export const getAuthDiagnostics = () => getRefreshDiagnostics();
