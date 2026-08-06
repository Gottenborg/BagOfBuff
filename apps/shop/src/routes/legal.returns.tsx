import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "../components/legal-layout";

export const Route = createFileRoute("/legal/returns")({
  head: () => ({
    meta: [{ title: "Right of Withdrawal & Returns — Bag of Buff" }],
  }),
  component: Returns,
});

function Returns() {
  return (
    <LegalLayout title="Right of Withdrawal & Returns">
      <p>
        If you are a consumer in the EU, you have the right to withdraw from this
        contract within 14 days without giving any reason.
      </p>

      <h2>Withdrawal period</h2>
      <p>
        The withdrawal period expires 14 days from the day on which you (or a
        third party you name, other than the carrier) take physical possession
        of the goods. For an order of multiple items delivered separately, it
        runs from possession of the last item.
      </p>

      <h2>How to withdraw</h2>
      <p>
        To exercise the right of withdrawal, inform us of your decision by a
        clear statement — for example an email to{" "}
        <a href="mailto:orders@bagofbuff.com">orders@bagofbuff.com</a>. You may
        use the model withdrawal form below, but it is not obligatory. To meet
        the deadline, it is enough to send your communication before the
        14-day period has expired.
      </p>

      <h2>Effects of withdrawal</h2>
      <p>
        If you withdraw, we will reimburse all payments received from you,
        including standard delivery costs, without undue delay and no later than
        14 days from the day we are informed. We may withhold reimbursement until
        we have received the goods back or you have supplied proof of return. You
        must send the goods back without undue delay and no later than 14 days
        from the day you notify us; you bear the direct cost of returning them.
        You are liable only for any diminished value resulting from handling
        beyond what is necessary to establish their nature and characteristics.
      </p>

      <h2>Model withdrawal form</h2>
      <p>
        (Complete and return this form only if you wish to withdraw from the
        contract.)
      </p>
      <ul className="not-prose rounded-md border border-border bg-subtle/40 p-4 text-sm">
        <li>To: Bag of Buff, orders@bagofbuff.com</li>
        <li>
          I/We hereby give notice that I/We withdraw from my/our contract of
          sale of the following goods:
        </li>
        <li>— Ordered on / received on:</li>
        <li>— Name of consumer(s):</li>
        <li>— Address of consumer(s):</li>
        <li>— Order reference:</li>
        <li>— Date:</li>
      </ul>

      <h2>Perishable or hygiene items</h2>
      <p>
        The right of withdrawal does not apply to sealed goods which are not
        suitable for return for health-protection or hygiene reasons if they
        were unsealed after delivery. Where this applies to a product, it is
        indicated on the product page.
      </p>
    </LegalLayout>
  );
}
