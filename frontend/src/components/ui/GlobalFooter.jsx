"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import BrandLogo from "./BrandLogo";
import TermsConditionsModal from "./TermsConditionsModal";
import { useAuthState } from "@/hooks/useAuthState";
import { openAuthLoginTab } from "@/lib/crossAppTabNavigation";
import { getAuthAppUrl } from "@/lib/core/appUrls";
import { guardDashboardNavigation } from "@/services/auth.service";

const TERMS_TEXT_PATH = "/legal/terms-conditions-property.txt";

const footerGroups = [
  {
    title: "Platform",
    links: [
      { label: "Home", href: "/home" },
      { label: "Browse India", href: "/in" },
      { label: "Login", href: "#" },
      { label: "Dashboard", href: "/dashboard" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About SeaNeB", href: "/about" },
      { label: "Solution", href: "/solution" },
      { label: "Partner With Us", href: "/partner" },
      { label: "Blogs", href: "/blogs" },
      { label: "Careers", href: "#" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Help Center", href: "/dashboard/help" },
      { label: "Contact", href: "/contact" },
      { label: "FAQ", href: "/faq" },
      { label: "Privacy Policy", href: "/privacy-policy" },
      { label: "Terms & Conditions", href: TERMS_TEXT_PATH },
    ],
  },
];

const socialLinks = [
  {
    label: "Facebook",
    href: "https://www.facebook.com/profile.php?id=61588178745293",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
        <path d="M13.5 8.25V6.9c0-.54.36-.9.9-.9H16V3h-2.1C11.67 3 10.5 4.17 10.5 6.39v1.86H8.25v3h2.25V21h3v-9.75H16.2l.45-3h-3.15z" />
      </svg>
    ),
  },
  {
    label: "X",
    href: "https://x.com/propertyseaneb",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
        <path d="M18.9 3h2.84l-6.21 7.1L22.8 21h-5.7l-4.47-5.85L7.5 21H4.65l6.64-7.59L4.2 3h5.84l4.03 5.32L18.9 3zm-1 16.3h1.58L9.18 4.62H7.5L17.9 19.3z" />
      </svg>
    ),
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/showcase/property-seaneb/",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
        <path d="M6.94 8.5H4v11h2.94v-11zM5.47 3.75a1.71 1.71 0 1 0 0 3.42 1.71 1.71 0 0 0 0-3.42zM20 13.21c0-3.02-1.61-4.43-3.76-4.43-1.73 0-2.5.95-2.93 1.62V8.5h-2.94v11h2.94v-6.14c0-1.62.31-3.19 2.32-3.19 1.98 0 2.01 1.85 2.01 3.29v6.04H20v-6.29z" />
      </svg>
    ),
  },
  {
    label: "YouTube",
    href: "https://www.youtube.com/@property.seaneb",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
        <path d="M21.58 7.19a2.96 2.96 0 0 0-2.08-2.09C17.66 4.5 12 4.5 12 4.5s-5.66 0-7.5.6A2.96 2.96 0 0 0 2.42 7.2 31.1 31.1 0 0 0 2 12a31.1 31.1 0 0 0 .42 4.81 2.96 2.96 0 0 0 2.08 2.09c1.84.6 7.5.6 7.5.6s5.66 0 7.5-.6a2.96 2.96 0 0 0 2.08-2.09A31.1 31.1 0 0 0 22 12a31.1 31.1 0 0 0-.42-4.81zM10 15.5v-7l6 3.5-6 3.5z" />
      </svg>
    ),
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/property.seaneb/",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
        <path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm5 3.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 0 1 12 7.5zm0 2A2.5 2.5 0 1 0 14.5 12 2.5 2.5 0 0 0 12 9.5zm4.75-3a1.25 1.25 0 1 1-1.25 1.25 1.25 1.25 0 0 1 1.25-1.25z" />
      </svg>
    ),
  },
];

export default function GlobalFooter() {
  const pathname = usePathname();
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const isDashboardRoute = pathname?.startsWith("/dashboard");
  const isAuthenticated = useAuthState();
  if (isDashboardRoute) return null;

  const handleLoginClick = (event) => {
    event.preventDefault();
    openAuthLoginTab();
  };

  const handleDashboardClick = (event) => {
    event.preventDefault();
    void guardDashboardNavigation({
      onAuthenticated: () => {
        window.location.assign(getAuthAppUrl("/dashboard"));
      },
      onUnauthenticated: () => {
        openAuthLoginTab();
      },
    });
  };

  const visibleFooterGroups = footerGroups.map((group) => ({
    ...group,
    links: group.links.filter((link) => {
      if (!link.href.startsWith("/dashboard")) return true;
      return isAuthenticated;
    }),
  }));
  const footerTextLinkClass =
    "relative text-sm text-slate-300 transition-colors hover:text-white after:absolute after:bottom-[-4px] after:left-0 after:h-[2px] after:w-0 after:bg-[var(--error)] after:transition-[width] after:duration-300 after:content-[''] hover:after:w-full";

  return (
    <footer className="border-t border-slate-800 bg-black text-slate-200">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-12 sm:px-6 lg:grid-cols-12 lg:px-8">
        <div className="lg:col-span-5">
          <BrandLogo
            size={42}
            titleClass="text-lg font-bold text-white"
            subtitleClass="text-xs font-medium text-slate-400"
          />
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-300">
            SeaNeB helps buyers, renters, and brokers discover verified residential and commercial properties with a smoother search experience.
          </p>
          <div className="mt-5 flex gap-2">
            {socialLinks.map((item) => (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={item.label}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-600 bg-black text-slate-200 transition-colors hover:border-slate-300 hover:text-white"
              >
                {item.icon}
              </a>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 lg:col-span-7">
          {visibleFooterGroups.map((group) => (
            <div key={group.title}>
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white">{group.title}</h4>
              <ul className="space-y-2.5">
                {group.links.map((link) => (
                  <li key={link.label}>
                    {link.href === TERMS_TEXT_PATH ? (
                      <button
                        type="button"
                        onClick={() => setTermsModalOpen(true)}
                        className={footerTextLinkClass}
                      >
                        {link.label}
                      </button>
                    ) : link.href.startsWith("http") ? (
                      <a
                        href={link.href}
                        className={footerTextLinkClass}
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className={footerTextLinkClass}
                        onClick={
                          link.label === "Login"
                            ? handleLoginClick
                            : link.href.startsWith("/dashboard")
                              ? handleDashboardClick
                              : undefined
                        }
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-800 px-4 py-4 text-center text-xs text-slate-400 sm:px-6 lg:px-8">
        Copyright {new Date().getFullYear()} SeaNeB. All rights reserved.
      </div>

      <TermsConditionsModal
        open={termsModalOpen}
        onClose={() => setTermsModalOpen(false)}
        textPath={TERMS_TEXT_PATH}
      />
    </footer>
  );
}

