import { useConsent } from "../lib/consent";

/**
 * Privacy-friendly, cookieless analytics (Plausible). Loads only when a
 * `VITE_PLAUSIBLE_DOMAIN` is configured and the visitor has accepted analytics.
 * Plausible sets no cookies and stores no personal data, keeping consent
 * friction low while still honouring an explicit opt-in.
 */
export function Analytics() {
  const consent = useConsent();
  const domain = import.meta.env.VITE_PLAUSIBLE_DOMAIN;
  if (!domain || consent !== "accepted") return null;

  return (
    <script
      defer
      data-domain={domain}
      src="https://plausible.io/js/script.js"
    />
  );
}
