"use client";

import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { locationTw } from "./locationTailwindClasses";

const PROPERTY_IMAGE = "/assets/propertyimages/image.png";

function formatPrice(value) {
  const text = String(value || "").trim();
  return text || "Price on request";
}

function BusinessListingPageContent({ title, subtitle, businesses = [] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryText = searchParams?.toString() || "";
  const fromPath = `${pathname || "/in"}${queryText ? `?${queryText}` : ""}`;
  const backToAreaKey = "seaneb:back_to_area";

  return (
    <section className={locationTw.wrapper} aria-labelledby="property-listing-title">
      <header className={locationTw.header}>
        <h2 id="property-listing-title" className={locationTw.headerTitle}>
          {title || "Properties Near You"}
        </h2>

        <p className={locationTw.headerDesc}>
          {subtitle ||
            "Browse verified residential and commercial properties curated for your selected area."}
        </p>
      </header>

      <div className={locationTw.listingGrid}>
        {businesses.length === 0 ? null : (
          businesses.map((business) => (
            <Link
              key={business.id}
              href={`/${business.slug}`}
              className={locationTw.card}
              aria-label={`View details of ${business.title}`}
              onClick={() => {
                if (typeof window === "undefined") return;
                try {
                  window.sessionStorage.setItem(backToAreaKey, fromPath);
                } catch {
                  // ignore storage errors
                }
              }}
            >
              <div className={locationTw.imageWrap}>
                <Image
                  src={business.image || PROPERTY_IMAGE}
                  alt={`${business.title} image`}
                  fill
                  className={locationTw.image}
                  sizes="(max-width: 768px) 100vw, 33vw"
                />

                <span className={locationTw.badge}>{business.type || "Property"}</span>
              </div>

              <div className={locationTw.cardBody}>
                <h3 className={locationTw.cardTitle}>{business.title}</h3>

                <p className={locationTw.cardLocation}>{business.location || "Location not available"}</p>

                <div className={locationTw.cardFooter}>
                  <span className={locationTw.cardPrice}>{formatPrice(business.price)}</span>

                  <span className={locationTw.cardAction}>View Details</span>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}

export default function BusinessListingPage(props) {
  return (
    <Suspense fallback={null}>
      <BusinessListingPageContent {...props} />
    </Suspense>
  );
}
