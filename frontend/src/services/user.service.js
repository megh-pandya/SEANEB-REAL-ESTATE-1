import { getCookie, removeCookie, setCookie } from "@/lib/core/cookies";

const listeners = new Set();

let authUserState = {
  status: "unauthenticated",
  profile: null,
};

const BUSINESS_ONBOARDING_RESUME_COOKIE = "business_onboarding_resume";
const BUSINESS_ONBOARDING_RESUME_QUERY = "resume_business_registration";
const ACTIVE_BUSINESS_STATUSES = new Set([
  "ACTIVE",
  "SUCCESS",
  "SUCCEEDED",
  "PAID",
  "CAPTURED",
  "COMPLETED",
]);
const NON_ACTIVE_BUSINESS_STATUSES = new Set([
  "PENDING",
  "PROCESSING",
  "INITIATED",
  "CREATED",
  "NOT_ATTEMPTED",
  "FAILED",
  "FAILURE",
  "ERROR",
  "CANCELLED",
  "CANCELED",
  "DECLINED",
  "EXPIRED",
  "TERMINATED",
]);

const emit = () => {
  for (const listener of listeners) {
    try {
      listener(authUserState);
    } catch {
      // Ignore subscriber errors.
    }
  }
};

const toBool = (value) => {
  if (value === true) return true;
  if (value === false || value == null) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
};

const isExplicitFalse = (value) => {
  if (value === false) return true;
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "false" || normalized === "0" || normalized === "no";
};

const readText = (...values) => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
};

const normalizeBusinessStatus = (value) => String(value ?? "").trim().toUpperCase();

const readClientBusinessRegistrationState = () => ({
  registered: toBool(getCookie("business_registered")),
  pending: toBool(getCookie(BUSINESS_ONBOARDING_RESUME_COOKIE)),
});

const readProfilePayload = (response) => {
  const profile =
    response?.data?.profile ||
    response?.data?.user ||
    response?.data ||
    response?.profile ||
    response?.user ||
    response;

  return profile && typeof profile === "object" ? profile : null;
};

export const restoreProfileSession = async () => {
  const snapshot = authUserState;
  if (snapshot.status !== "authenticated") return null;
  return readProfilePayload(snapshot.profile);
};

export const getMyProfile = async () => restoreProfileSession();

export const getBusinessRegistrationStateFromProfile = (profile) => {
  const data = profile || {};
  const clientState = readClientBusinessRegistrationState();
  const branchStatuses = [
    data.branch_status,
    data.branchStatus,
    data.current_branch_status,
    data.currentBranchStatus,
    data.default_branch_status,
    data.defaultBranchStatus,
    data.branch?.status,
    data.current_branch?.status,
    data.currentBranch?.status,
    data.default_branch?.status,
    data.defaultBranch?.status,
    data.business?.branch_status,
    data.business?.branchStatus,
    data.onboarding?.branch_status,
    data.onboarding?.branchStatus,
    data.onboarding?.status,
    data.onboarding_status,
    data.onboardingStatus,
  ]
    .map(normalizeBusinessStatus)
    .filter(Boolean);

  const explicitRegisteredTrue =
    toBool(data.is_business_registered) ||
    toBool(data.business_registered) ||
    toBool(data.is_business);

  const explicitRegisteredFalse =
    isExplicitFalse(data.is_business_registered) ||
    isExplicitFalse(data.business_registered);
  const showPayNowHint =
    toBool(data.onboarding?.show_pay_now) ||
    toBool(data.onboarding?.showPayNow) ||
    toBool(data.show_pay_now) ||
    toBool(data.showPayNow);

  const limitedAccess =
    toBool(data.auth_limited) ||
    toBool(data.limited) ||
    toBool(data.panel_access_restricted) ||
    toBool(data.branch_required);

  const hasActiveBranch = branchStatuses.some((status) => ACTIVE_BUSINESS_STATUSES.has(status));
  const hasKnownNonActiveBranch = branchStatuses.some((status) =>
    NON_ACTIVE_BUSINESS_STATUSES.has(status)
  );
  const hasOnboardingObject = Boolean(
    data.onboarding && typeof data.onboarding === "object" && !Array.isArray(data.onboarding)
  );
  const hasWeakLegacyBusinessHints =
    Boolean(
      data.business_id ||
        data.business_uuid ||
        data.business_slug ||
        data.branch_id ||
        data.branch_uuid ||
        data.branch_slug ||
        data.broker_id ||
        data.company_id ||
        data.onboarding?.business_id ||
        data.onboarding?.branch_id
    ) ||
    (typeof data.business_count === "number" && data.business_count > 0) ||
    (Array.isArray(data.businesses) && data.businesses.length > 0) ||
    (Array.isArray(data.user_businesses) && data.user_businesses.length > 0) ||
    (Array.isArray(data.branches) && data.branches.length > 0) ||
    (Array.isArray(data.user_branches) && data.user_branches.length > 0) ||
    (Array.isArray(data.branch_list) && data.branch_list.length > 0) ||
    Boolean(
      (data.business &&
        typeof data.business === "object" &&
        (data.business.id ||
          data.business.business_id ||
          data.business.uuid ||
          data.business.branch_id)) ||
          (data.branch &&
          typeof data.branch === "object" &&
          (data.branch.id ||
            data.branch.branch_id ||
            data.branch.uuid ||
            data.branch.business_id))
    );
  const hasStrongLegacyBusinessHints =
    (typeof data.business_count === "number" && data.business_count > 0) ||
    (Array.isArray(data.businesses) && data.businesses.length > 0) ||
    (Array.isArray(data.user_businesses) && data.user_businesses.length > 0) ||
    (Array.isArray(data.branches) && data.branches.length > 0) ||
    (Array.isArray(data.user_branches) && data.user_branches.length > 0) ||
    (Array.isArray(data.branch_list) && data.branch_list.length > 0);

  const onboardingState = normalizeBusinessStatus(
    readText(
      data.onboarding?.state,
      data.onboarding?.stage,
      data.onboarding?.step,
      data.onboarding_state,
      data.onboardingState
    )
  );
  const hasPendingOnboarding =
    limitedAccess ||
    hasKnownNonActiveBranch ||
    showPayNowHint ||
    ((explicitRegisteredFalse || !explicitRegisteredTrue) &&
      (hasOnboardingObject || Boolean(onboardingState))) ||
    ((explicitRegisteredFalse || hasOnboardingObject || Boolean(onboardingState) || showPayNowHint) &&
      (hasWeakLegacyBusinessHints || hasStrongLegacyBusinessHints));

  if (hasActiveBranch) {
    return { registered: true, pending: false };
  }

  // The auth app sets business_registered only after payment is confirmed and
  // the branch is activated. Prefer that confirmed client signal over stale
  // pending hints while the listing profile catches up.
  if (clientState.registered) {
    return { registered: true, pending: false };
  }

  if (hasPendingOnboarding) {
    return { registered: false, pending: true };
  }

  if (explicitRegisteredTrue) {
    return { registered: true, pending: false };
  }

  if (hasStrongLegacyBusinessHints) {
    return { registered: true, pending: false };
  }

  if (clientState.pending) {
    return { registered: false, pending: true };
  }

  return { registered: false, pending: false };
};

export const hasBusinessFromProfile = (profile) => {
  return getBusinessRegistrationStateFromProfile(profile).registered;
};

export const syncPendingBusinessRegistrationFromSearch = (searchParams = null) => {
  const readParam = (key) => {
    if (!searchParams || typeof searchParams.get !== "function") return "";
    return String(searchParams.get(key) || "").trim();
  };

  const resumeValue = readParam(BUSINESS_ONBOARDING_RESUME_QUERY);
  const onboardingValue = readParam("business_onboarding").toLowerCase();
  const shouldPersistResume =
    toBool(resumeValue) ||
    onboardingValue === "resume" ||
    onboardingValue === "pending";

  if (!shouldPersistResume) return false;

  setCookie(BUSINESS_ONBOARDING_RESUME_COOKIE, "true", {
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  return true;
};

export const hasPendingBusinessRegistration = (profile = null) => {
  const state = getBusinessRegistrationStateFromProfile(profile || {});
  if (state.pending) return true;
  if (state.registered) return false;
  return toBool(getCookie(BUSINESS_ONBOARDING_RESUME_COOKIE));
};

export const getProfileVerificationStatus = (profile) => {
  const data = profile || {};
  const seanebId = String(data.seaneb_id || data.seanebId || "").trim();
  const fullName = String(data.full_name || data.fullName || "").trim();

  const hasExplicitUserVerification =
    toBool(data.is_user_verified) ||
    toBool(data.user_verified) ||
    toBool(data.is_verified) ||
    toBool(data.verified) ||
    toBool(data.kyc_verified);

  return {
    seanebId,
    userVerified: hasExplicitUserVerification || Boolean(fullName && seanebId),
    businessVerified: hasBusinessFromProfile(data),
  };
};

export const syncBusinessRegistrationCookie = (profile) => {
  const state = getBusinessRegistrationStateFromProfile(profile);
  const hasBusiness = state.registered;
  setCookie("business_registered", hasBusiness ? "true" : "false", {
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  if (state.pending) {
    setCookie(BUSINESS_ONBOARDING_RESUME_COOKIE, "true", {
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
  } else {
    removeCookie(BUSINESS_ONBOARDING_RESUME_COOKIE, { path: "/" });
  }
  return hasBusiness;
};

export const getAuthUserStateSnapshot = () => authUserState;

export const setAuthUserRestoring = () => {
  authUserState = { status: "unauthenticated", profile: null };
  emit();
};

export const setAuthUserAuthenticated = (profile) => {
  authUserState = {
    status: "authenticated",
    profile: profile && typeof profile === "object" ? profile : null,
  };
  emit();
};

export const setAuthUserLoggedOut = () => {
  authUserState = { status: "unauthenticated", profile: null };
  emit();
};

export const subscribeAuthUserState = (listener) => {
  if (typeof listener !== "function") return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
};
