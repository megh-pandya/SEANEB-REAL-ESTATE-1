"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import MainNavbar from "@/components/ui/MainNavbar";
import { getBusinessDetailsBySeanebId } from "@/services/property.service";

function BusinessDetailContent({ businessSlug }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [details, setDetails] = useState(null);
  const [backOverride, setBackOverride] = useState("");
  const backToAreaKey = "seaneb:back_to_area";

  const fallbackName = useMemo(
    () =>
      businessSlug
        ? businessSlug
            .replace(/[_-]/g, " ")
            .split(" ")
            .filter(Boolean)
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ")
        : "Business",
    [businessSlug]
  );

  useEffect(() => {
    let active = true;

    const loadDetails = async () => {
      if (!businessSlug) {
        setError("Business identifier is missing.");
        setLoading(false);
        return;
      }

      try {
        setError("");
        setLoading(true);
        const data = await getBusinessDetailsBySeanebId(businessSlug);
        if (!active) return;

        if (!data) {
          setError("Business details not found.");
          setDetails(null);
        } else {
          setDetails(data);
        }
      } catch {
        if (!active) return;
        setError("Unable to load business details right now.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadDetails();

    return () => {
      active = false;
    };
  }, [businessSlug]);

  useEffect(() => {
    const fromParam = String(searchParams?.get("from") || "").trim();
    const safeFrom = fromParam.startsWith("/in/") ? fromParam : "";

    if (safeFrom) {
      setBackOverride(safeFrom);
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem(backToAreaKey, safeFrom);
        } catch {
          // ignore storage errors
        }
      }
    } else if (!backOverride && typeof window !== "undefined") {
      try {
        const stored = String(window.sessionStorage.getItem(backToAreaKey) || "").trim();
        if (stored.startsWith("/in/")) {
          setBackOverride(stored);
        }
      } catch {
        // ignore storage errors
      }
    }

    if (fromParam && pathname) {
      const nextParams = new URLSearchParams(searchParams?.toString() || "");
      nextParams.delete("from");
      const nextQuery = nextParams.toString();
      const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
      router.replace(nextUrl, { scroll: false });
    }
  }, [searchParams, pathname, router, backOverride]);

  const business = details?.business || {};
  const hierarchy = details?.hierarchy || {};
  const area = hierarchy?.area || {};
  const city = hierarchy?.city || {};
  const state = hierarchy?.state || {};
  const country = hierarchy?.country || {};

  const businessName =
    business?.display_name ||
    business?.business_name ||
    details?.display_name ||
    details?.business_name ||
    fallbackName;

  const toSeoSlug = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-");

  const areaSlug = toSeoSlug(area?.area_name || area?.name);
  const citySlug = toSeoSlug(city?.city_name || city?.name);
  const stateSlug = toSeoSlug(state?.state_slug || state?.slug || state?.state_name || state?.name);
  const computedBackHref =
    areaSlug && citySlug ? `/in/${areaSlug}-${citySlug}` : citySlug && stateSlug ? `/in/${citySlug}-${stateSlug}` : "/in";
  const backToAreaHref = backOverride || computedBackHref;

  const detailRows = [
    ["SeaNeB ID", details?.seaneb_id || businessSlug || "-"],
    ["Branch ID", details?.branch_id || "-"],
    ["Business ID", business?.business_id || details?.business_id || "-"],
    ["Primary Number", details?.primary_number || "-"],
    ["WhatsApp", details?.whatsapp_number || "-"],
    ["Email", details?.business_email || "-"],
    ["Address", details?.address || "-"],
    ["Landmark", details?.landmark || "-"],
    ["Latitude", details?.latitude ?? "-"],
    ["Longitude", details?.longitude ?? "-"],
    ["Business Type", business?.business_type || details?.business_type || "-"],
    ["Business Status", business?.business_status ?? details?.business_status ?? "-"],
    ["About Branch", details?.about_branch || "-"],
  ];
  const locationHierarchy =
    [area?.area_name, city?.city_name, state?.state_name, country?.country_name]
      .filter(Boolean)
      .join(", ") || "-";

  const identityRows = detailRows.slice(0, 3);
  const contactRows = detailRows.slice(3, 8);
  const geoRows = detailRows.slice(8, 10);
  const metaRows = detailRows.slice(10);

  const statCards = [
    ["Branch", details?.branch_id || "-"],
    ["Type", business?.business_type || details?.business_type || "-"],
    ["Status", business?.business_status ?? details?.business_status ?? "-"],
  ];

  return (
    <>
      <MainNavbar />
      <div className="relative min-h-screen overflow-hidden bg-[var(--gray-50)] px-4 py-8 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[var(--error-bg)] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-[var(--color-shadow-card-hover)] blur-3xl" />

        <div className="relative mx-auto max-w-5xl">
          <section className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--background)] shadow-[0_18px_45px_var(--color-shadow-card-hover-strong)]">
            <div className="border-b border-[var(--border)] bg-[linear-gradient(110deg,var(--text-primary)_0%,var(--color-gradient-hero-dark-mid)_55%,var(--color-country-cta-end)_100%)] p-6 text-[var(--text-inverse)] sm:p-8">
              <p className="mb-3 text-sm text-[var(--gray-200)]">
                <Link className="hover:underline" href="/in">Home</Link> /{" "}
                <Link className="hover:underline" href={backToAreaHref}>Area</Link> / {businessName}
              </p>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{businessName}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--gray-200)] sm:text-base">
                {details?.about_branch || `Business detail page for ${businessName}.`}
              </p>
            </div>

            {loading && (
              <div className="p-8">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--gray-50)] p-6 text-[var(--text-secondary)]">
                  Loading business details...
                </div>
              </div>
            )}

            {!loading && error && (
              <div className="p-8">
                <div className="rounded-2xl border border-[var(--error)] bg-[var(--error-bg)] p-6 text-[var(--error)]">
                  {error}
                </div>
              </div>
            )}

            {!loading && !error && (
              <div className="space-y-6 p-6 sm:p-8">
                <div className="grid gap-4 lg:grid-cols-4">
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--gray-50)] p-5 lg:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      Location Hierarchy
                    </p>
                    <p className="mt-2 text-base font-semibold text-[var(--text-primary)]">
                      {locationHierarchy}
                    </p>
                  </div>
                  {statCards.map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        {label}
                      </p>
                      <p className="mt-2 break-all text-sm font-semibold text-[var(--text-primary)]">
                        {String(value ?? "-")}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-5">
                    <h3 className="mb-4 text-lg font-bold text-[var(--text-primary)]">Identity</h3>
                    <div className="space-y-3">
                      {identityRows.map(([label, value]) => (
                        <p key={label} className="text-sm text-[var(--text-secondary)]">
                          <strong className="text-[var(--text-primary)]">{label}:</strong>{" "}
                          {String(value ?? "-")}
                        </p>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-5">
                    <h3 className="mb-4 text-lg font-bold text-[var(--text-primary)]">Contact</h3>
                    <div className="space-y-3">
                      {contactRows.map(([label, value]) => (
                        <p key={label} className="text-sm text-[var(--text-secondary)]">
                          <strong className="text-[var(--text-primary)]">{label}:</strong>{" "}
                          {String(value ?? "-")}
                        </p>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-5">
                    <h3 className="mb-4 text-lg font-bold text-[var(--text-primary)]">Geo Coordinates</h3>
                    <div className="space-y-3">
                      {geoRows.map(([label, value]) => (
                        <p key={label} className="text-sm text-[var(--text-secondary)]">
                          <strong className="text-[var(--text-primary)]">{label}:</strong>{" "}
                          {String(value ?? "-")}
                        </p>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-5">
                    <h3 className="mb-4 text-lg font-bold text-[var(--text-primary)]">Business Meta</h3>
                    <div className="space-y-3">
                      {metaRows.map(([label, value]) => (
                        <p key={label} className="text-sm text-[var(--text-secondary)]">
                          <strong className="text-[var(--text-primary)]">{label}:</strong>{" "}
                          {String(value ?? "-")}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--border)] bg-[var(--gray-50)] p-5">
                  <h3 className="mb-4 text-lg font-bold text-[var(--text-primary)]">
                    Area / City / State / Country
                  </h3>
                  <ul className="grid gap-3 text-sm text-[var(--text-secondary)] sm:grid-cols-2">
                    <li>
                      <strong className="text-[var(--text-primary)]">Area:</strong>{" "}
                      {area?.area_name || "-"} ({area?.area_id || "-"})
                    </li>
                    <li>
                      <strong className="text-[var(--text-primary)]">City:</strong>{" "}
                      {city?.city_name || "-"} ({city?.city_id || "-"})
                    </li>
                    <li>
                      <strong className="text-[var(--text-primary)]">State:</strong>{" "}
                      {state?.state_name || "-"} ({state?.state_id || "-"})
                    </li>
                    <li>
                      <strong className="text-[var(--text-primary)]">Country:</strong>{" "}
                      {country?.country_name || "-"} ({country?.country_id || "-"})
                    </li>
                  </ul>
                </div>
              </div>
            )}

            <div className="border-t border-[var(--border)] p-6 sm:px-8">
              <Link
                href={backToAreaHref}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--background)] px-5 py-2 text-sm font-semibold text-[var(--text-secondary)] transition-all hover:border-[var(--brand-blue)] hover:text-[var(--brand-blue)]"
              >
                Back to Area
              </Link>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

export default function BusinessDetail(props) {
  return (
    <Suspense fallback={null}>
      <BusinessDetailContent {...props} />
    </Suspense>
  );
}

