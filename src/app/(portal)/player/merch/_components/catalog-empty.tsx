import Link from "next/link";

/** No merch yet: an empty court waiting for kit, and what the player can do meanwhile */
export function CatalogEmpty() {
  return (
    <div className="mx-auto max-w-sm px-2 py-10 text-center sm:py-14">
      <svg width="190" height="130" viewBox="0 0 190 130" className="mx-auto mb-4" aria-hidden="true">
        <path d="M8 118 L182 118 L150 30 L40 30 Z" fill="#F6EFDA" />
        <path d="M40 30 L150 30 L182 118 L8 118 Z" fill="none" stroke="#124B5D" strokeWidth="4" strokeLinejoin="round" />
        <path d="M22 78 L168 78" stroke="#5CACB0" strokeWidth="3" opacity=".8" />
        <path d="M95 30 L95 118" stroke="#124B5D" strokeWidth="2" opacity=".35" />
        <ellipse cx="122" cy="84" rx="12" ry="3" fill="#0C313A" opacity=".12" />
        <circle cx="122" cy="62" r="13" fill="#fff" stroke="#124B5D" strokeWidth="2.5" />
        <path d="M110 58 Q122 54 134 62 M112 70 Q121 62 128 51" fill="none" stroke="#F7AC40" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <h2 className="text-lg font-extrabold text-primary-900">Merch is on its way</h2>
      <p className="mt-1.5 text-sm text-slate-600">Hoodies, tees and gear show up here as soon as the academy adds them.</p>
      <p className="mt-4 rounded-xl bg-primary-50 px-4 py-2.5 text-sm text-primary-700">
        After something specific? Tell your coach at your next session.
      </p>
      <Link
        href="/player/sessions"
        className="mt-4 inline-block rounded-lg border border-primary-100 bg-white px-4 py-2 text-sm font-semibold text-primary hover:bg-primary-50"
      >
        See my sessions
      </Link>
    </div>
  );
}
