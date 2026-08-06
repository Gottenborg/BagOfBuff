import { Link } from "@tanstack/react-router";
import { Container } from "@repo/ui";

const LINKS = [
  { to: "/legal/terms", label: "Terms & Conditions" },
  { to: "/legal/returns", label: "Right of Withdrawal & Returns" },
  { to: "/legal/privacy", label: "Privacy & Cookies" },
] as const;

/**
 * Global footer with the consumer-law links the EU requires to be reachable
 * from every page, plus a note on where data is processed (all EU).
 */
export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border bg-paper/60">
      <Container size="lg" className="py-10">
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-muted">
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="transition-colors hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <p className="mt-4 text-xs leading-relaxed text-muted">
          Prices include VAT. All personal data is processed within the EU
          (Supabase — Frankfurt; Resend — EU region; hosting — EU). Payments are
          handled by Stripe.
        </p>
        <p className="mt-2 text-xs text-muted">
          © {new Date().getFullYear()} Bag of Buff. Company registration and
          contact details to be completed before launch.
        </p>
      </Container>
    </footer>
  );
}
