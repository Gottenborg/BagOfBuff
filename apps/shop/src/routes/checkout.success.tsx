import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Container, Heading, Loading, Text } from "@repo/ui";
import { SiteHeader } from "../components/site-header";
import { clearCart } from "../lib/cart";
import { formatPrice } from "../lib/format";
import { api } from "../lib/api";

export const Route = createFileRoute("/checkout/success")({
  // `order_id` is appended to the success URL by the API; `session_id` is
  // substituted by Stripe. Both are optional so a bare visit doesn't crash.
  validateSearch: (search: Record<string, unknown>) => ({
    order_id: typeof search.order_id === "string" ? search.order_id : undefined,
    session_id:
      typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  component: CheckoutSuccess,
});

function CheckoutSuccess() {
  const { order_id } = Route.useSearch();

  // Payment succeeded — empty the cart once, on mount.
  useEffect(() => {
    clearCart();
  }, []);

  const order = useQuery({
    queryKey: ["order", order_id],
    enabled: Boolean(order_id),
    queryFn: async () => {
      const { data, error } = await api.GET("/checkout/orders/{id}", {
        params: { path: { id: order_id! } },
      });
      if (error || !data) return null;
      return data;
    },
  });

  return (
    <>
      <SiteHeader />
      <Container as="main" size="md" className="py-12">
        <Heading level={1} size={2}>
          Thank you for your order!
        </Heading>
        <Text muted className="mt-3">
          Your payment was successful. A confirmation email is on its way.
        </Text>

        {order.isLoading && <Loading className="mt-8">Loading your order…</Loading>}

        {order.data && (
          <div className="mt-8 rounded-lg border border-border p-6">
            <p className="text-sm text-muted">
              Order reference{" "}
              <span className="font-mono text-foreground">
                {order.data.id}
              </span>
            </p>
            <ul className="mt-4 divide-y divide-border">
              {order.data.items.map((i) => (
                <li key={i.slug} className="flex justify-between py-2">
                  <span>
                    {i.quantity}× {i.name}
                  </span>
                  <span className="tabular-nums">
                    {formatPrice(i.unitPriceCents * i.quantity, i.currency)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-1 border-t border-border pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd className="tabular-nums">
                  {formatPrice(order.data.subtotalCents, order.data.currency)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Shipping</dt>
                <dd className="tabular-nums">
                  {formatPrice(order.data.shippingCents, order.data.currency)}
                </dd>
              </div>
              {order.data.taxCents !== null && (
                <div className="flex justify-between">
                  <dt className="text-muted">VAT</dt>
                  <dd className="tabular-nums">
                    {formatPrice(order.data.taxCents, order.data.currency)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">
                  {formatPrice(
                    order.data.totalCents ?? order.data.subtotalCents,
                    order.data.currency,
                  )}
                </dd>
              </div>
            </dl>
          </div>
        )}

        <div className="mt-8">
          <Link to="/" className="font-semibold text-brand-strong">
            Continue shopping
          </Link>
        </div>
      </Container>
    </>
  );
}
