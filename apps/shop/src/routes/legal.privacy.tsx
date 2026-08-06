import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "../components/legal-layout";

export const Route = createFileRoute("/legal/privacy")({
  head: () => ({ meta: [{ title: "Privacy & Cookies — Bag of Buff" }] }),
  component: Privacy,
});

function Privacy() {
  return (
    <LegalLayout title="Privacy & Cookies">
      <p>
        This policy explains what personal data we process, why, and where. We
        keep processing within the EU wherever possible and use only reputable
        processors.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Order data</strong> — items, delivery address, and email,
          to fulfil and support your order.
        </li>
        <li>
          <strong>Payment data</strong> — handled by Stripe; we never see your
          full card details.
        </li>
        <li>
          <strong>Analytics</strong> — only if you accept, we use Plausible, a
          cookieless, privacy-friendly analytics tool that stores no personal
          data and sets no cookies.
        </li>
      </ul>

      <h2>Where your data is processed</h2>
      <ul>
        <li>Database &amp; auth: Supabase (Frankfurt, EU).</li>
        <li>Transactional email: Resend (EU region).</li>
        <li>Hosting: EU region.</li>
        <li>
          Payments &amp; tax: Stripe, acting as our payment processor and,
          for VAT, via Stripe Tax.
        </li>
      </ul>

      <h2>Cookies</h2>
      <p>
        We use strictly necessary storage to run the cart and checkout (this is
        exempt from consent). We do not use advertising or tracking cookies.
        Optional analytics load only after you accept them in the banner; you
        can decline with no loss of functionality.
      </p>

      <h2>Your rights</h2>
      <p>
        Under the GDPR you have the right to access, rectify, erase, restrict,
        and port your personal data, and to object to processing. To exercise
        these rights, contact{" "}
        <a href="mailto:privacy@bagofbuff.com">privacy@bagofbuff.com</a>. You may
        also lodge a complaint with your local data protection authority.
      </p>

      <h2>Retention</h2>
      <p>
        We keep order and invoicing records for as long as required by tax and
        accounting law, and otherwise only as long as necessary for the purposes
        described above.
      </p>
    </LegalLayout>
  );
}
