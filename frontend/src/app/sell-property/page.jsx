import Link from "next/link";
import MarketingPageShell from "@/components/marketing/shared/MarketingPageShell";
import { getSiteUrl } from "@/lib/siteUrl";

export const metadata = {
  title: "Sell Property in India | SeaNeB Realty",
  description:
    "List your property for free on SeaNeB Realty. Reach genuine buyers, price smartly, and sell faster with transparent listing support.",
  alternates: {
    canonical: getSiteUrl("/sell-property"),
  },
};

const toPlaceLabel = (value) =>
  String(value || "")
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

export function SellPropertyContent({ place = "" }) {
  const locationText = place ? ` in ${place}` : "";

  return (
    <MarketingPageShell>
      <section className="bg-gradient-to-r from-amber-900 via-amber-800 to-orange-700 text-white">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">Sell Property</p>
          <h1 className="mt-3 text-3xl font-bold sm:text-5xl">Sell Your Property Faster{locationText}</h1>
          <p className="mt-4 max-w-3xl text-sm text-amber-100 sm:text-lg">
            Publish a clear listing, connect with genuine buyers directly, and move faster with documentation-first transparency.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">What Sellers Usually Struggle With</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>How do I sell quickly without underpricing?</li>
            <li>How can I avoid fake calls and low-intent inquiries?</li>
            <li>Which documents should be ready before listing?</li>
          </ul>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Why Sell on SeaNeB Realty</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>Free listing flow with structured property details.</li>
            <li>City and locality discovery to reach relevant buyers.</li>
            <li>Direct communication without unnecessary delays.</li>
            <li>Clear listing inputs that reduce confusion and rework.</li>
          </ul>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Trust and Transparency Standards</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>RERA awareness and documentation-first listing guidance.</li>
            <li>Ownership and legal detail visibility before serious discussions.</li>
            <li>Fraud-aware reporting pathways for suspicious activity.</li>
          </ul>
        </article>

        <article className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-xl font-semibold text-slate-900">Ready to List Your Property?</h2>
          <p className="mt-2 text-sm text-slate-700">
            Start with complete details and quality photos to attract serious buyers faster.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Post Property
            </Link>
            <Link
              href="/home#search"
              className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-500"
            >
              Search Buyer Demand
            </Link>
          </div>
        </article>
      </section>
    </MarketingPageShell>
  );
}

export default async function SellPropertyPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const place = toPlaceLabel(resolvedSearchParams?.place);
  return <SellPropertyContent place={place} />;
}
