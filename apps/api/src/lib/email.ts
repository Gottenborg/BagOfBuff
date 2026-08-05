import { env } from "./env";
import type { Order, OrderItem } from "../db/schema";

/**
 * Transactional email via Resend's REST API. We call the endpoint directly
 * rather than pulling in the SDK — it's a single POST and keeps the dependency
 * surface small. When RESEND_API_KEY is unset (local/dev), sending is a logged
 * no-op so checkout still completes end-to-end without an email provider.
 */
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function isEmailConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY);
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

/** Renders the order confirmation as a small, self-contained HTML email. */
function renderConfirmation(order: Order, items: OrderItem[]): string {
  const currency = order.currency;
  const rows = items
    .map(
      (i) =>
        `<tr>
          <td style="padding:6px 0;">${i.quantity}× ${escapeHtml(i.name)}</td>
          <td style="padding:6px 0;text-align:right;">${formatMoney(
            i.unitPriceCents * i.quantity,
            currency,
          )}</td>
        </tr>`,
    )
    .join("");

  const line = (label: string, cents: number | null) =>
    cents === null
      ? ""
      : `<tr>
          <td style="padding:2px 0;">${label}</td>
          <td style="padding:2px 0;text-align:right;">${formatMoney(
            cents,
            currency,
          )}</td>
        </tr>`;

  return `<!doctype html>
<html>
  <body style="font-family:system-ui,sans-serif;color:#111;max-width:520px;margin:0 auto;">
    <h1 style="font-size:20px;">Thanks for your order!</h1>
    <p>We've received your payment and are getting your Bag of Buff ready to ship.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      ${rows}
      <tr><td colspan="2"><hr style="border:none;border-top:1px solid #eee;"/></td></tr>
      ${line("Subtotal", order.subtotalCents)}
      ${line("Shipping", order.shippingCents)}
      ${line("Tax (VAT)", order.taxCents)}
      <tr style="font-weight:600;">
        <td style="padding:6px 0;">Total</td>
        <td style="padding:6px 0;text-align:right;">${formatMoney(
          order.totalCents ?? order.subtotalCents,
          currency,
        )}</td>
      </tr>
    </table>
    <p style="color:#666;font-size:13px;">Order reference: ${order.id}</p>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Sends the order confirmation email. Never throws — email failures must not
 * fail the webhook (Stripe would retry and we'd double-process). Returns
 * whether an email was actually dispatched.
 */
export async function sendOrderConfirmation(
  order: Order,
  items: OrderItem[],
): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log(
      `✉️  [email disabled] order ${order.id} confirmation would go to ${order.email ?? "<no email>"}`,
    );
    return false;
  }
  if (!order.email) {
    console.warn(`Order ${order.id} has no email; skipping confirmation`);
    return false;
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.ORDER_FROM_EMAIL,
        to: order.email,
        subject: `Your Bag of Buff order (${order.id})`,
        html: renderConfirmation(order, items),
      }),
    });
    if (!res.ok) {
      console.error(
        `Resend send failed for order ${order.id}: ${res.status} ${await res.text()}`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error(`Resend send threw for order ${order.id}:`, err);
    return false;
  }
}
