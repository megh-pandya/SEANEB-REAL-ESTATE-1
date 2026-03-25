"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { getCookie } from "@/lib/core/cookies";
import {
  DASHBOARD_MODE_BUSINESS,
  DASHBOARD_MODE_USER,
  getDashboardMode,
  setDashboardMode,
} from "@/services/property.service";
import {
  getBusinessRegistrationStateFromProfile,
  syncBusinessRegistrationCookie,
  syncPendingBusinessRegistrationFromSearch,
} from "@/services/user.service";
import BrandLogo from "./BrandLogo";
import { logoutAndClearAuthSession } from "@/services/auth.service";
import { getDefaultProductName } from "@/services/property.service";
import { useListingAuth } from "@/lib/auth/AuthProvider";
import { openAuthPathWithBridge, openBusinessRegisterFlow } from "@/lib/crossAppTabNavigation";
import { getAuthAppUrl } from "@/lib/core/appUrls";

function DashboardHeaderContent({ showLogout = true }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status: authStatus, user: authProfile } = useListingAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [dashboardMode, setDashboardModeState] = useState(DASHBOARD_MODE_USER);
  const [hasBusiness, setHasBusiness] = useState(false);
  const [hasPendingBusinessOnboarding, setHasPendingBusinessOnboarding] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const dropdownRef = useRef(null);

  const fallbackEmail = useMemo(() => getLoggedInEmail(), []);
  const profile = authProfile || null;
  const userEmail = profile?.email || fallbackEmail;
  const userDisplayName = profile?.full_name || userEmail;
  const productName = getDefaultProductName();
  const authDashboardUrl = getAuthAppUrl("/dashboard");
  const authBusinessDashboardUrl = getAuthAppUrl("/dashboard/broker");

  useEffect(() => {
    setDashboardModeState(getDashboardMode());
    setHasBusiness(false);
  }, []);

  useEffect(() => {
    syncPendingBusinessRegistrationFromSearch(searchParams);
  }, [searchParams]);

  useEffect(() => {
    if (authStatus !== "authenticated") {
      setHasBusiness(false);
      setHasPendingBusinessOnboarding(false);
      return;
    }

    const businessState = getBusinessRegistrationStateFromProfile(profile || {});
    setHasBusiness(Boolean(businessState.registered));
    setHasPendingBusinessOnboarding(Boolean(businessState.pending));
    syncBusinessRegistrationCookie(profile || {});
  }, [authStatus, profile]);

  useEffect(() => {
    const onClickOutside = (event) => {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const handleLogout = async () => {
    if (typeof window !== "undefined" && !window.confirm("Are you sure you want to log out?")) {
      return;
    }
    try {
      setIsLoading(true);
      await logoutAndClearAuthSession();
      router.push("/");
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      setIsLoading(false);
      setIsProfileOpen(false);
    }
  };

  const handleModeSwitch = () => {
    setIsProfileOpen(false);

    if (dashboardMode === DASHBOARD_MODE_BUSINESS) {
      setDashboardMode(DASHBOARD_MODE_USER);
      setDashboardModeState(DASHBOARD_MODE_USER);
      void openAuthPathWithBridge("/dashboard", { fallbackUrl: authDashboardUrl });
      return;
    }

    if (!hasBusiness) {
      openBusinessRegisterFlow();
      return;
    }

    setDashboardMode(DASHBOARD_MODE_BUSINESS);
    setDashboardModeState(DASHBOARD_MODE_BUSINESS);
    void openAuthPathWithBridge("/dashboard/broker", { fallbackUrl: authBusinessDashboardUrl });
  };

  return (
    <header className="sticky top-0 z-40 h-16 w-full border-b border-gray-200 bg-white shadow-md">
      <div className="flex h-full w-full items-center justify-between px-4 sm:px-6 lg:px-8 lg:pl-[18rem]">
        <Link href="/" className="group transition-opacity hover:opacity-85">
          <div className="transition-transform group-hover:scale-110">
            <BrandLogo
              size={36}
              titleClass="text-xl font-bold text-gray-900"
              subtitleClass="text-xs font-medium text-gray-600"
              textWrapperClass="hidden sm:block"
            />
          </div>
        </Link>

        <div className="flex items-center gap-3" ref={dropdownRef}>
          <div
            className={`hidden items-center rounded-full border px-3 py-1 text-xs font-semibold sm:inline-flex ${
              dashboardMode === DASHBOARD_MODE_BUSINESS
                ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {dashboardMode === DASHBOARD_MODE_BUSINESS ? "Business Mode" : "User Mode"}
          </div>

          <button
            type="button"
            onClick={() => setIsProfileOpen((open) => !open)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            {profile?.profile_photo && !avatarLoadFailed ? (
              <Image
                src={profile.profile_photo}
                alt={userDisplayName || "Profile"}
                onError={() => setAvatarLoadFailed(true)}
                className="h-7 w-7 rounded-full object-cover"
                width={28}
                height={28}
                loading="lazy"
                referrerPolicy="no-referrer"
                unoptimized
              />
            ) : (
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-sm">
                {"\u{1F464}"}
              </span>
            )}
            <span className="hidden sm:inline">Profile</span>
            <span className="text-xs text-gray-400">{isProfileOpen ? "^" : "v"}</span>
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 top-14 w-[min(92vw,18rem)] rounded-xl border border-gray-200 bg-white p-4 shadow-xl sm:right-6 lg:right-8">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Logged in as</p>
              <p className="mt-1 truncate text-sm font-semibold text-gray-900">{userDisplayName}</p>
              <p className="mt-1 truncate text-xs font-medium text-gray-500">{productName}</p>
              <p className="mt-1 truncate text-xs text-gray-600">{userEmail}</p>
              {dashboardMode !== DASHBOARD_MODE_BUSINESS && (
                <button
                  type="button"
                  onClick={handleModeSwitch}
                  className="mt-4 w-full rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
                >
                  {hasBusiness
                    ? "Switch to Business Dashboard"
                    : hasPendingBusinessOnboarding
                      ? "Complete Registration"
                      : "Business Register"}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setIsProfileOpen(false);
                  router.push("/home");
                }}
                className="mt-3 w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100"
              >
                Visit Listings Home
              </button>
              {showLogout && (
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleLogout}
                  className="mt-3 w-full rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
                >
                  {isLoading ? "Logging out..." : "Logout"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default function DashboardHeader(props) {
  return (
    <Suspense fallback={null}>
      <DashboardHeaderContent {...props} />
    </Suspense>
  );
}

function getLoggedInEmail() {
  const direct = String(getCookie("verified_email") || getCookie("user_email") || "").trim();

  if (direct.includes("@")) return direct;

  return "No email found";
}

