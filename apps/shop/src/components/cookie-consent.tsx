import { Link } from "@tanstack/react-router";
import { Button } from "@repo/ui";
import { setConsent, useConsent } from "../lib/consent";

/**
 * Consent banner. Shown until the visitor makes a choice. Essential cookies run
 * regardless; analytics load only on "Accept". Cookieless analytics (Plausible)
 * means declining costs the visitor nothing.
 */
export function CookieConsent() {
  const consent = useConsent();
  if (consent !== null) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-paper/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-ink-700">
          We use only essential cookies to run the shop, plus optional
          privacy-friendly, cookieless analytics. See our{" "}
          <Link
            to="/legal/privacy"
            className="font-semibold text-brand-strong underline"
          >
            privacy policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConsent("rejected")}
          >
            Essential only
          </Button>
          <Button size="sm" onClick={() => setConsent("accepted")}>
            Accept analytics
          </Button>
        </div>
      </div>
    </div>
  );
}
