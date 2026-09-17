import { ACADEMY_DEFAULTS } from "@/lib/branding";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";

/**
 * A holding page for the legal routes.
 *
 * These used to redirect to the WordPress site. Now that the LMS serves the
 * domain itself the redirect would loop, so the routes render this until the
 * real text is written - replace the body of each page, not this component.
 */
export default function LegalPagePlaceholder({ title }: { title: string }) {
  return (
    <>
      <MarketingHeader demoHref="/register" />
      <main className="min-h-[60vh] bg-[#f7f8fb] px-4 py-16 text-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-black sm:text-4xl">{title}</h1>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            We are publishing the full text of this policy. In the meantime, write to{" "}
            <a href={`mailto:${ACADEMY_DEFAULTS.email}`} className="font-semibold text-brand underline">
              {ACADEMY_DEFAULTS.email}
            </a>{" "}
            and we will send you a copy.
          </p>
          <p className="mt-6 text-sm text-slate-500">{ACADEMY_DEFAULTS.legalName}</p>
        </div>
      </main>
      <MarketingFooter />
    </>
  );
}
