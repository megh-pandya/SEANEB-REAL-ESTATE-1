"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import BrandLogo from "./BrandLogo";
import TempUserAvatar from "./TempUserAvatar";
import navbarLinks from "@/data/navbarLinks.json";
import { getCookie } from "@/lib/core/cookies";
import { getAuthAppUrl } from "@/lib/core/appUrls";
import { useListingAuth } from "@/hooks/auth/useListingAuth";
import { getCountries } from "@/services/property.service";
import {
  getBusinessRegistrationStateFromProfile,
  syncPendingBusinessRegistrationFromSearch,
  syncBusinessRegistrationCookie,
} from "@/services/user.service";
import { openAuthPathWithBridge, openBusinessRegisterFlow, openAuthLoginTab } from "@/lib/crossAppTabNavigation";
import { guardDashboardNavigation } from "@/services/auth.service";

const THEME_STORAGE_KEY = "seaneb_theme_mode";
const THEME_MODES = {
  LIGHT: "light",
  DARK: "dark",
  SYSTEM: "system",
};

const getSystemTheme = () => {
  if (typeof window === "undefined") return THEME_MODES.LIGHT;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? THEME_MODES.DARK
    : THEME_MODES.LIGHT;
};

const applyThemeMode = (mode) => {
  if (typeof document === "undefined") return;
  const nextMode = [THEME_MODES.LIGHT, THEME_MODES.DARK, THEME_MODES.SYSTEM].includes(mode)
    ? mode
    : THEME_MODES.SYSTEM;
  const resolved = nextMode === THEME_MODES.SYSTEM ? getSystemTheme() : nextMode;
  const root = document.documentElement;

  root.classList.toggle("dark", resolved === THEME_MODES.DARK);
  root.setAttribute("data-theme-mode", nextMode);
  root.style.colorScheme = resolved;
};

function isPathActive(pathname, href) {
  if (!href || href.startsWith("#") || href.startsWith("http")) return false;
  if (href === "/home") return pathname === "/" || pathname === "/home";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavbarItem({ item, isActive, onNavigate, tone = "desktop" }) {
  const isExternal = item.href.startsWith("http");
  const isAnchor = item.href.startsWith("#");
  const useAnchorTag = isExternal || item.download || isAnchor;
  const baseClass = tone === "mobile"
    ? "relative inline-flex px-3 py-1.5 text-base font-medium tracking-[0.01em] transition-colors duration-200 after:absolute after:bottom-[-9px] after:left-3 after:right-3 after:h-[2px] after:rounded-full after:content-['']"
    : "relative inline-flex px-3 py-1.5 text-[15px] font-medium tracking-[0.01em] transition-colors duration-200 after:absolute after:bottom-[-8px] after:left-3 after:right-3 after:h-[2px] after:rounded-full after:content-['']";

  const activeClass = tone === "mobile"
    ? (isActive
      ? "text-white after:scale-x-100 after:bg-[#c79a2b]"
      : "text-slate-300 hover:text-white after:origin-left after:scale-x-0 after:bg-white/75 after:transition-transform after:duration-200 hover:after:scale-x-100")
    : (isActive
      ? "text-[#2e2115] after:scale-x-100 after:bg-[#c79a2b]"
      : "text-[#6f6256] hover:text-[#2e2115] after:origin-left after:scale-x-0 after:bg-[#2e2115]/55 after:transition-transform after:duration-200 hover:after:scale-x-100");

  if (useAnchorTag) {
    return (
      <a
        href={item.href}
        download={item.download ? true : undefined}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer" : undefined}
        className={`${baseClass} ${activeClass}`}
        onClick={onNavigate}
      >
        {item.name}
      </a>
    );
  }

  return (
    <Link href={item.href} className={`${baseClass} ${activeClass}`} onClick={onNavigate}>
      {item.name}
    </Link>
  );
}

function MainNavbarContent() {
  const router = useRouter();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [themeMode, setThemeMode] = useState(THEME_MODES.SYSTEM);
  const dropdownRef = useRef(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isHomeRoute = pathname === "/" || pathname === "/home";
  const { status: authStatus, user: profile, logout } = useListingAuth();
  const [hasBusiness, setHasBusiness] = useState(false);
  const [hasPendingBusinessOnboarding, setHasPendingBusinessOnboarding] = useState(false);
  const [countryBadgeName, setCountryBadgeName] = useState("");
  const fallbackEmail = getCookie("verified_email") || getCookie("user_email") || "";
  const fallbackSeaNebId = getCookie("seaneb_id") || "";
  const userEmail =
    profile?.email ||
    profile?.user_email ||
    profile?.verified_email ||
    fallbackEmail;
  const userName =
    profile?.full_name ||
    profile?.fullName ||
    profile?.first_name ||
    profile?.firstName ||
    profile?.name ||
    userEmail ||
    "User";
  const userSeaNebId = String(profile?.seaneb_id || profile?.seanebId || fallbackSeaNebId || "").trim();
  const profilePhoto = String(profile?.profile_photo || profile?.profilePhoto || "").trim();
  const profileUrl = getAuthAppUrl("/dashboard/broker");
  const canShowAuthenticated = hydrated && authStatus === "authenticated";
  const downloadSectionHref = "/home#download";

  const handleGetAppClick = (event) => {
    if (pathname === "/" || pathname === "/home") {
      event.preventDefault();
      const target = document.getElementById("download");
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        window.history.replaceState(null, "", "#download");
      }
      return;
    }
    router.push(downloadSectionHref);
  };

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    let rafId = 0;
    let last = window.scrollY > 18;
    setHasScrolled(last);

    const update = () => {
      rafId = 0;
      const next = window.scrollY > 18;
      if (next !== last) {
        last = next;
        setHasScrolled(next);
      }
    };

    const onScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

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
  }, [profile, authStatus]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const profileKeys = profile && typeof profile === "object" ? Object.keys(profile) : [];
    console.log("[navbar] auth status:", authStatus);
    console.log("[navbar] received profile:", Boolean(profile), profileKeys.join(",") || "none");
  }, [authStatus, profile]);

  useEffect(() => {
    let active = true;

    const loadCountryBadge = async () => {
      try {
        const countries = await getCountries();
        if (!active) return;
        const firstName = String(countries?.[0]?.name || "").trim();
        setCountryBadgeName(firstName || "India");
      } catch {
        if (!active) return;
        setCountryBadgeName("India");
      }
    };

    void loadCountryBadge();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = String(window.localStorage.getItem(THEME_STORAGE_KEY) || "").trim().toLowerCase();
    const initialMode = [THEME_MODES.LIGHT, THEME_MODES.DARK, THEME_MODES.SYSTEM].includes(saved)
      ? saved
      : THEME_MODES.SYSTEM;
    setThemeMode(initialMode);
    applyThemeMode(initialMode);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (themeMode === THEME_MODES.SYSTEM) {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const onChange = () => applyThemeMode(THEME_MODES.SYSTEM);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }
  }, [themeMode]);

  const handleLogout = async () => {
    if (typeof window !== "undefined" && !window.confirm("Are you sure you want to log out?")) {
      return;
    }
    try {
      await logout({ redirect: true });
    } finally {
      setIsProfileOpen(false);
    }
  };

  const handleLoginClick = (event) => {
    if (event?.preventDefault) event.preventDefault();
    setIsProfileOpen(false);
    openAuthLoginTab();
  };

  const handleRegisterBusinessClick = (event) => {
    if (event?.preventDefault) event.preventDefault();
    setIsProfileOpen(false);

    const businessState = getBusinessRegistrationStateFromProfile(profile || {});
    const isBusinessRegisteredNow = Boolean(businessState.registered);
    const hasPendingBusinessRegistrationNow = Boolean(businessState.pending);

    if (isBusinessRegisteredNow) {
      void guardDashboardNavigation({
        onAuthenticated: async () => {
          await openAuthPathWithBridge("/dashboard/broker", { fallbackUrl: profileUrl });
        },
        onUnauthenticated: () => {
          openAuthLoginTab();
        },
      });
      return;
    }

    if (hasPendingBusinessRegistrationNow) {
      openBusinessRegisterFlow();
      return;
    }

    openBusinessRegisterFlow();
  };

  const handleThemeModeChange = (mode) => {
    const nextMode = [THEME_MODES.LIGHT, THEME_MODES.DARK, THEME_MODES.SYSTEM].includes(mode)
      ? mode
      : THEME_MODES.SYSTEM;
    setThemeMode(nextMode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextMode);
    }
    applyThemeMode(nextMode);
  };

  return (
    <>
    <header
      className={`fixed inset-x-0 top-0 z-[120] overflow-visible ${
        isHomeRoute ? "bg-transparent" : "bg-[#6a4300]"
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
        <div
          className="rounded-full border border-[#3a2a1c]/45 bg-[#f5ece4]/95 shadow-[0_10px_28px_rgba(30,20,10,0.16)] backdrop-blur transition-all duration-300"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
            <div className="flex items-center gap-3">
              <Link
                href="/home"
                className="rounded-xl px-1 py-1 transition hover:bg-[#eadccf]"
              >
                <BrandLogo
                  size={44}
                  titleClass="text-[#2e2115] text-lg font-bold"
                  subtitleClass="text-[#866f58] text-xs"
                  textWrapperClass="block"
                  compact
                />
              </Link>
              <div className="hidden sm:flex items-center">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#c79a2b]/70 bg-[#f1dfbf] px-3 py-1 text-xs font-semibold text-[#6d5220]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#c79a2b]" />
                  {countryBadgeName || "India"}
                </span>
              </div>
            </div>

            <nav className="hidden items-center gap-1 lg:flex">
              {navbarLinks.map((item) => (
                <NavbarItem
                  key={`${item.name}-${item.href}`}
                  item={item}
                  isActive={isPathActive(pathname, item.href)}
                  tone="desktop"
                />
              ))}
            </nav>

            <div className="relative flex items-center gap-2" ref={dropdownRef}>
              <Link
                href={downloadSectionHref}
                onClick={handleGetAppClick}
                className="hidden rounded-full border border-[#3a2a1c] bg-transparent px-5 py-2 text-sm font-semibold text-[#2e2115] transition hover:bg-[#eadccf] sm:inline-block"
              >
                Get the App
              </Link>

              <button
                type="button"
                onClick={() => setIsProfileOpen((open) => !open)}
                className="inline-flex items-center gap-2 rounded-full border border-[#3a2a1c]/40 bg-white/60 px-2 py-1 text-[#2e2115] transition hover:border-[#3a2a1c] hover:bg-white/80"
                aria-label="Profile menu"
              >
                {profilePhoto ? (
                  <span className="inline-flex h-8 w-8 overflow-hidden rounded-full border border-[#3a2a1c]/25 bg-white/60">
                    <Image
                      src={profilePhoto}
                      alt={userName || "Profile"}
                      width={32}
                      height={32}
                      className="h-full w-full object-cover"
                      unoptimized
                    />
                  </span>
                ) : (
                  <TempUserAvatar size="sm" />
                )}
                <span className="hidden pr-1 text-xs font-semibold sm:inline">
                  {canShowAuthenticated ? "My Profile" : "Sign In"}
                </span>
              </button>

              {isProfileOpen && (
                <div className="absolute right-0 top-[calc(100%+0.55rem)] z-[100] w-[min(92vw,18rem)] rounded-2xl border border-[#ddd6cc] bg-[#f5f4f8] p-2 text-[#2e2115] shadow-[0_18px_40px_rgba(25,20,16,0.22)]">
                  <div className="mb-2 grid grid-cols-3 gap-1 rounded-lg border border-[#e4dfd6] bg-white p-1">
                    <button
                      type="button"
                      aria-label="Light mode"
                      onClick={() => handleThemeModeChange(THEME_MODES.LIGHT)}
                      className={`rounded-md py-1.5 text-sm transition ${
                        themeMode === THEME_MODES.LIGHT
                          ? "bg-[#efe4d5] text-[#2e2115]"
                          : "text-[#7a6c5c] hover:bg-[#f5efe6]"
                      }`}
                    >
                      <svg viewBox="0 0 24 24" className="mx-auto h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="4" />
                        <path d="M12 2v2.5M12 19.5V22M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M2 12h2.5M19.5 12H22M4.93 19.07l1.77-1.77M17.3 6.7l1.77-1.77" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      aria-label="Dark mode"
                      onClick={() => handleThemeModeChange(THEME_MODES.DARK)}
                      className={`rounded-md py-1.5 text-sm transition ${
                        themeMode === THEME_MODES.DARK
                          ? "bg-[#efe4d5] text-[#2e2115]"
                          : "text-[#7a6c5c] hover:bg-[#f5efe6]"
                      }`}
                    >
                      <svg viewBox="0 0 24 24" className="mx-auto h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 1 0 9.8 9.8z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      aria-label="System mode"
                      onClick={() => handleThemeModeChange(THEME_MODES.SYSTEM)}
                      className={`rounded-md py-1.5 text-sm transition ${
                        themeMode === THEME_MODES.SYSTEM
                          ? "bg-[#efe4d5] text-[#2e2115]"
                          : "text-[#7a6c5c] hover:bg-[#f5efe6]"
                      }`}
                    >
                      <svg viewBox="0 0 24 24" className="mx-auto h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="3" y="4" width="18" height="12" rx="2" />
                        <path d="M8 20h8M12 16v4" />
                      </svg>
                    </button>
                  </div>

                  {canShowAuthenticated ? (
                    <>
                      <div className="rounded-xl border border-[#e4dfd6] bg-white p-3">
                        <div className="flex items-center gap-2.5">
                          {profilePhoto ? (
                            <span className="inline-flex h-10 w-10 overflow-hidden rounded-full border border-[#e0dbd3] bg-[#f6f1ea]">
                              <Image
                                src={profilePhoto}
                                alt={userName || "Profile"}
                                width={40}
                                height={40}
                                className="h-full w-full object-cover"
                                unoptimized
                              />
                            </span>
                          ) : (
                            <TempUserAvatar size="sm" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#2e2115]">{userName}</p>
                            <p className="truncate text-xs text-[#7a6c5c]">
                              {userSeaNebId ? `SeaNeB ID: ${userSeaNebId}` : userEmail || "Signed in user"}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 overflow-hidden rounded-xl border border-[#e4dfd6] bg-white">
                        <Link
                          href={hasBusiness ? profileUrl : "#"}
                          onClick={handleRegisterBusinessClick}
                          className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-[#403125] transition hover:bg-[#f8f1e5]"
                        >
                          <span aria-hidden="true">{"\u25A6"}</span>
                          <span>
                            {hasBusiness
                              ? "Open Dashboard"
                              : hasPendingBusinessOnboarding
                                ? "Complete Registration"
                                : "Register Business"}
                          </span>
                        </Link>
                        <div className="h-px bg-[#efe9df]" />
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-[#7a2020] transition hover:bg-[#fff1f1]"
                        >
                          <span aria-hidden="true">{"\u21AA"}</span>
                          <span>Log Out</span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-xl border border-[#e4dfd6] bg-white p-3">
                      <div className="flex items-center gap-2.5">
                        <TempUserAvatar size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#2e2115]">Welcome to SeaNeB</p>
                          <p className="text-xs text-[#7a6c5c]">Access your account to continue</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleLoginClick}
                        className="mt-3 w-full rounded-lg border border-[#3a2a1c]/35 bg-[#f8f3ec] px-3 py-2 text-sm font-semibold text-[#2e2115] transition hover:bg-[#efe4d5]"
                      >
                        Sign In
                      </button>
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => setIsMobileMenuOpen((open) => !open)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#3a2a1c]/40 bg-white/50 text-[#2e2115] transition hover:bg-white/75 lg:hidden"
                aria-label="Toggle menu"
              >
                <span className="text-lg leading-none">{isMobileMenuOpen ? "\u2715" : "\u2261"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="border-t border-white/15 bg-slate-950/95 px-4 py-3 sm:px-6 lg:hidden">
          <nav className="grid grid-cols-2 gap-2">
            {navbarLinks.map((item) => (
              <NavbarItem
                key={`mobile-${item.name}-${item.href}`}
                item={item}
                isActive={isPathActive(pathname, item.href)}
                tone="mobile"
                onNavigate={() => setIsMobileMenuOpen(false)}
              />
            ))}
          </nav>
          <Link
            href={downloadSectionHref}
            onClick={(event) => {
              setIsMobileMenuOpen(false);
              handleGetAppClick(event);
            }}
            className="mt-3 block rounded-xl border border-[#c79a2b] bg-[#c79a2b] px-4 py-2 text-center text-sm font-semibold text-[#1b1304] hover:bg-[#d8ac3e]"
          >
            Get the App
          </Link>
        </div>
      )}
    </header>
    {!isHomeRoute && <div className="h-[88px] bg-[#6a4300]" aria-hidden="true" />}
    </>
  );
}

export default function MainNavbar() {
  return (
    <Suspense fallback={null}>
      <MainNavbarContent />
    </Suspense>
  );
}

