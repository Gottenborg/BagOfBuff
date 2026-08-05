import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Button, Container, Field, Heading, Input, Text } from "@repo/ui";
import { SiteHeader } from "../components/site-header";
import { removeFromCart, setQty, useCart } from "../lib/cart";
import { formatPrice } from "../lib/format";
import { api } from "../lib/api";

export const Route = createFileRoute("/checkout")({ component: Checkout });

// Destinations we ship to (mirrors the seeded shipping zones). The API is the
// authority — a country it can't serve returns a "we don't ship there" quote.
const COUNTRIES: { code: string; name: string }[] = [
  { code: "DK", name: "Denmark" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "SE", name: "Sweden" },
  { code: "IE", name: "Ireland" },
  { code: "GB", name: "United Kingdom" },
  { code: "NO", name: "Norway" },
  { code: "CH", name: "Switzerland" },
  { code: "US", name: "United States" },
];

function Checkout() {
  const cart = useCart();
  const [country, setCountry] = useState("DK");
  const [email, setEmail] = useState("");
  const [selectedRate, setSelectedRate] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotalCents = useMemo(
    () => cart.reduce((sum, i) => sum + i.priceCents * i.qty, 0),
    [cart],
  );
  const currency = cart[0]?.currency ?? "EUR";

  // Fetch shipping options for the chosen destination + subtotal.
  const quote = useQuery({
    queryKey: ["shipping-quote", country, subtotalCents],
    enabled: cart.length > 0,
    queryFn: async () => {
      const { data, error } = await api.POST("/shipping/quote", {
        body: { country, subtotalCents },
      });
      if (error || !data) return null; // 404 → we don't ship there
      return data;
    },
  });

  const options = quote.data?.options ?? [];
  // Default the selection to the first (cheapest) option.
  const activeRate =
    selectedRate && options.some((o) => o.id === selectedRate)
      ? selectedRate
      : (options[0]?.id ?? null);
  const chosen = options.find((o) => o.id === activeRate) ?? null;
  const shippingCents = chosen?.priceCents ?? 0;

  async function pay() {
    if (!activeRate) return;
    setSubmitting(true);
    setError(null);
    const { data, error } = await api.POST("/checkout/session", {
      body: {
        items: cart.map((i) => ({ slug: i.slug, quantity: i.qty })),
        country,
        shippingRateId: activeRate,
        email: email.trim() || null,
      },
    });
    if (error || !data) {
      setError(
        (error as { message?: string })?.message ??
          "Could not start checkout. Please try again.",
      );
      setSubmitting(false);
      return;
    }
    // Hand off to Stripe's hosted checkout.
    window.location.href = data.url;
  }

  if (cart.length === 0) {
    return (
      <>
        <SiteHeader />
        <Container as="main" size="md" className="py-12">
          <Heading level={1} size={2}>
            Your cart is empty
          </Heading>
          <Text muted className="mt-3">
            Find something worth carrying.{" "}
            <Link to="/" className="font-semibold text-brand-strong">
              Browse products
            </Link>
          </Text>
        </Container>
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <Container as="main" size="md" className="py-12">
        <Heading level={1} size={2}>
          Checkout
        </Heading>

        {/* Cart lines */}
        <section className="mt-8">
          <ul className="divide-y divide-border">
            {cart.map((item) => (
              <li
                key={item.slug}
                className="flex items-center justify-between gap-4 py-4"
              >
                <div className="min-w-0">
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-sm text-muted">
                    {formatPrice(item.priceCents, item.currency)} each
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={1}
                    value={item.qty}
                    aria-label={`Quantity for ${item.name}`}
                    className="w-20"
                    onChange={(e) =>
                      setQty(item.slug, Number(e.currentTarget.value))
                    }
                  />
                  <span className="w-20 text-right font-medium tabular-nums">
                    {formatPrice(item.priceCents * item.qty, item.currency)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFromCart(item.slug)}
                    className="text-sm text-muted hover:text-danger"
                    aria-label={`Remove ${item.name}`}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Destination + contact */}
        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <Field label="Ship to" htmlFor="country">
            <select
              id="country"
              value={country}
              onChange={(e) => {
                setCountry(e.currentTarget.value);
                setSelectedRate(null);
              }}
              className="h-10 rounded-md border border-border bg-paper px-3 text-sm"
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Email (for your receipt)" htmlFor="email">
            <Input
              id="email"
              type="email"
              value={email}
              placeholder="you@example.com"
              onChange={(e) => setEmail(e.currentTarget.value)}
            />
          </Field>
        </section>

        {/* Shipping options */}
        <section className="mt-8">
          <Heading level={2} size={4}>
            Shipping
          </Heading>
          {quote.isLoading && (
            <Text muted className="mt-2">
              Finding shipping options…
            </Text>
          )}
          {!quote.isLoading && options.length === 0 && (
            <Text className="mt-2 text-danger">
              We don't ship to that destination yet.
            </Text>
          )}
          <div className="mt-3 space-y-2">
            {options.map((o) => (
              <label
                key={o.id}
                className="flex cursor-pointer items-center justify-between rounded-md border border-border p-3 has-[:checked]:border-brand-strong"
              >
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="shipping"
                    checked={activeRate === o.id}
                    onChange={() => setSelectedRate(o.id)}
                  />
                  <span>
                    <span className="font-medium">{o.name}</span>
                    {o.minDeliveryDays !== null &&
                      o.maxDeliveryDays !== null && (
                        <span className="ml-2 text-sm text-muted">
                          {o.minDeliveryDays}–{o.maxDeliveryDays} business days
                        </span>
                      )}
                  </span>
                </span>
                <span className="font-medium tabular-nums">
                  {o.free ? "Free" : formatPrice(o.priceCents, o.currency)}
                </span>
              </label>
            ))}
          </div>
        </section>

        {/* Summary + pay */}
        <section className="mt-8 border-t border-border pt-6">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd className="tabular-nums">
                {formatPrice(subtotalCents, currency)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Shipping</dt>
              <dd className="tabular-nums">
                {chosen
                  ? chosen.free
                    ? "Free"
                    : formatPrice(shippingCents, currency)
                  : "—"}
              </dd>
            </div>
            <div className="flex justify-between pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">
                {formatPrice(subtotalCents + shippingCents, currency)}
              </dd>
            </div>
          </dl>
          <Text muted className="mt-1 text-xs">
            VAT is calculated at payment based on your address.
          </Text>

          {error && <Text className="mt-4 text-danger">{error}</Text>}

          <Button
            size="lg"
            className="mt-6 w-full"
            disabled={!activeRate || submitting}
            onClick={pay}
          >
            {submitting ? "Redirecting…" : "Pay with card"}
          </Button>
        </section>
      </Container>
    </>
  );
}
