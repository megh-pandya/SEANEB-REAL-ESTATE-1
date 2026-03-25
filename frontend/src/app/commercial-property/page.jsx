import Link from "next/link";
import MarketingPageShell from "@/components/marketing/shared/MarketingPageShell";
import { getSiteUrl } from "@/lib/siteUrl";

export const metadata = {
  title: "Commercial Property India | SeaNeB Realty",
  description:
    "Explore offices, shops, and commercial spaces in India. Compare lease vs buy options with local market and yield insights.",
  alternates: {
    canonical: getSiteUrl("/commercial-property"),
  },
};

const toPlaceLabel = (value) =>
  String(value || "")
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

export function CommercialPropertyContent({ place = "" }) {
  const locationText = place ? ` in ${place}` : "";

  return (
    <MarketingPageShell>
      <section className="bg-gradient-to-r from-amber-900 via-amber-800 to-orange-700 text-white">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">Commercial Property</p>
          <h1 className="mt-3 text-3xl font-bold sm:text-5xl">Commercial Spaces That Match Business Goals{locationText}</h1>
          <p className="mt-4 max-w-3xl text-sm text-amber-100 sm:text-lg">
            Evaluate office, retail, and investment opportunities with location-level context, pricing clarity, and trust-focused discovery.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">What Commercial Buyers and Tenants Ask</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>Should I lease or buy commercial property in this market?</li>
            <li>Which areas have stronger rental demand and footfall?</li>
            <li>How do I assess long-term rental yield potential?</li>
          </ul>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Why Use SeaNeB Realty for Commercial Search</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>Discovery across offices, shops, showrooms, and warehouses.</li>
            <li>City and locality filters aligned to business decision needs.</li>
            <li>Support for lease and buy comparison in one workflow.</li>
            <li>Clear listing inputs for faster shortlist and outreach.</li>
          </ul>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Trust and Market Clarity</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>Verification-aware listing standards for better confidence.</li>
            <li>Direct communication with owners or authorized representatives.</li>
            <li>Hyperlocal market signals for demand, pricing, and rental yield context.</li>
          </ul>
        </article>

        <article className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-xl font-semibold text-slate-900">Start Your Commercial Search</h2>
          <p className="mt-2 text-sm text-slate-700">
            Shortlist high-fit spaces and connect quickly to move from discovery to decision with less friction.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/home#search"
              className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Search Commercial
            </Link>
            <Link
              href="/in?q=commercial+property+in+india"
              className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-500"
            >
              View Commercial Listings
            </Link>
          </div>
        </article>
      </section>
    </MarketingPageShell>
  );
}

export default async function CommercialPropertyPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const place = toPlaceLabel(resolvedSearchParams?.place);
  return <CommercialPropertyContent place={place} />;
}
