import Link from "next/link";
import MarketingPageShell from "@/components/marketing/shared/MarketingPageShell";
import { getSiteUrl } from "@/lib/siteUrl";

export const metadata = {
  title: "Rent Property in India | SeaNeB Realty",
  description:
    "Find verified rental homes in India with direct owner contact, broker-free options, and clearer rental terms on SeaNeB Realty.",
  alternates: {
    canonical: getSiteUrl("/rent-property"),
  },
};

const toPlaceLabel = (value) =>
  String(value || "")
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

export function RentPropertyContent({ place = "" }) {
  const locationText = place ? ` in ${place}` : "";

  return (
    <MarketingPageShell>
      <section className="bg-gradient-to-r from-amber-900 via-amber-800 to-orange-700 text-white">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">Rent Property</p>
          <h1 className="mt-3 text-3xl font-bold sm:text-5xl">Find Verified Rentals{locationText}</h1>
          <p className="mt-4 max-w-3xl text-sm text-amber-100 sm:text-lg">
            Discover rental homes with transparent listing details, practical locality context, and faster owner-to-tenant communication.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Common Rental Search Problems</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>How do I identify genuine rental listings?</li>
            <li>Can I find direct owner options and avoid extra brokerage?</li>
            <li>What should be checked before token or advance payment?</li>
          </ul>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Why Rent Through SeaNeB Realty</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>Verified-first rental discovery with better listing quality.</li>
            <li>Direct communication for faster and clearer decision making.</li>
            <li>Broker-free paths where available.</li>
            <li>Local rent insight to compare realistic expectations by area.</li>
          </ul>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Trust and Transparency Standards</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>Encourages clarity on rent, deposit, notice period, and maintenance.</li>
            <li>Promotes documentation awareness before payment commitment.</li>
            <li>Supports safer conversations with fraud-aware platform practices.</li>
          </ul>
        </article>

        <article className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-xl font-semibold text-slate-900">Ready to Find a Home on Rent?</h2>
          <p className="mt-2 text-sm text-slate-700">
            Compare verified rental options and shortlist homes that match your budget and locality needs.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/home#search"
              className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Search Rentals
            </Link>
            <Link
              href="/faq"
              className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-500"
            >
              Read Rental FAQs
            </Link>
          </div>
        </article>
      </section>
    </MarketingPageShell>
  );
}

export default async function RentPropertyPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const place = toPlaceLabel(resolvedSearchParams?.place);
  return <RentPropertyContent place={place} />;
}
