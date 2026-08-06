import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "../components/legal-layout";

export const Route = createFileRoute("/legal/terms")({
  head: () => ({ meta: [{ title: "Terms & Conditions — Bag of Buff" }] }),
  component: Terms,
});

function Terms() {
  return (
    <LegalLayout title="Terms & Conditions">
      <h2>1. These terms</h2>
      <p>
        These terms govern the sale of goods through this store to consumers in
        the EU. By placing an order you agree to them. The seller's company and
        contact details are set out in the footer and are to be finalised before
        launch.
      </p>

      <h2>2. Prices &amp; VAT</h2>
      <p>
        All prices are shown in euro and include VAT. The applicable VAT is
        determined by your delivery country and is calculated at checkout via
        Stripe Tax. Shipping costs, where they apply, are shown before you
        confirm your order.
      </p>

      <h2>3. Orders &amp; contract</h2>
      <p>
        Your order is an offer to buy. The contract is formed when we confirm
        the order by email. We may decline an order — for example if an item is
        out of stock or a price was clearly erroneous.
      </p>

      <h2>4. Delivery</h2>
      <p>
        We ship to the destinations listed at checkout. Delivery-time estimates
        are indicative. Risk in the goods passes to you on delivery.
      </p>

      <h2>5. Right of withdrawal</h2>
      <p>
        Consumers have a 14-day right of withdrawal. See{" "}
        <a href="/legal/returns">Right of Withdrawal &amp; Returns</a> for the
        conditions and the model withdrawal form.
      </p>

      <h2>6. Subscriptions</h2>
      <p>
        Where you take a "subscribe &amp; save" plan, deliveries and payments
        recur at the interval shown. You can manage or cancel your subscription
        at any time from the{" "}
        <a href="/account">account portal</a>; cancellation stops future
        renewals.
      </p>

      <h2>7. Statutory guarantee</h2>
      <p>
        Goods must conform to the contract. As a consumer you benefit from the
        statutory guarantee of conformity under EU law; nothing in these terms
        affects your mandatory legal rights.
      </p>

      <h2>8. Governing law</h2>
      <p>
        These terms are governed by the law of the seller's country of
        establishment, without depriving you of the protection of the mandatory
        consumer rules of your country of residence.
      </p>
    </LegalLayout>
  );
}
