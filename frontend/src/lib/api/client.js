// CRITICAL FIX: Deprecate legacy client and re-export unified auth client
// This legacy client had its own refresh logic causing token desync.
// All API calls should now use @/lib/auth/apiClient for unified auth handling.
import apiClient from "@/lib/auth/apiClient";

console.warn("[DEPRECATED] @/lib/api/client is deprecated. Use @/lib/auth/apiClient instead for unified auth handling.");

export default apiClient;
export const api = apiClient;
