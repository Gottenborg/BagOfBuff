import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useSearch } from "@tanstack/react-router";
import type { paths } from "@repo/api-client";
import { Button, Loading, Text } from "@repo/ui";
import { apiErrorMessage } from "../lib/errors";
import { formatPrice } from "../lib/format";
import { api } from "../lib/api";
import { useSession } from "../lib/auth";
import { LoginForm } from "../components/login-form";

type Order =
  paths["/admin/orders/{id}"]["get"]["responses"][200]["content"]["application/json"];

type DocumentKind = "packing-slip" | "invoice";

export const Route = createFileRoute("/documents/$id")({
  validateSearch: (search: Record<string, unknown>): { type: DocumentKind } => ({
    type: search.type === "invoice" ? "invoice" : "packing-slip",
  }),
  component: DocumentRoute,
});

/**
 * Printable order documents.
 *
 * Deliberately outside the admin chrome: this page is meant to become paper,
 * so the navigation, cards and shell would only be ink. Printing is left to the
 * browser rather than generating a PDF server-side — it needs no dependency, no
 * font bundling, and "Save as PDF" is a button away in every print dialog.
 */
function DocumentRoute() {
  const { session, loading } = useSession();
  if (loading) return <Loading className="p-8" />;
  if (!session) return <LoginForm />;
  return <OrderDocument />;
}

function OrderDocument() {
  const { id } = Route.useParams();
  const { type } = useSearch({ from: "/documents/$id" });
  const queryClient = useQueryClient();

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      const { data, error } = await api.GET("/admin/orders/{id}", {
        params: { path: { id } },
      });
      if (error) throw new Error("Failed to load order");
      return data;
    },
  });

  const issue = useMutation({
    mutationFn: async () => {
      const { error, response } = await api.POST("/admin/orders/{id}/invoice", {
        params: { path: { id } },
      });
      if (error)
        throw new Error(
          apiErrorMessage(error, response, "Could not issue the invoice."),
        );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["order", id] }),
  });

  if (isLoading) return <Loading className="p-8" />;
  if (isError || !order)
    return <Text className="p-8 text-danger">Could not load this order.</Text>;

  const isInvoice = type === "invoice";

  return (
    <div className="mx-auto max-w-[210mm] p-8 print:p-0">
      {/* Controls — never printed. */}
      <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <Link
          to="/orders/$id"
          params={{ id }}
          className="text-sm font-semibold text-muted hover:text-foreground"
        >
          ← Back to order
        </Link>
        <Link
          to="/documents/$id"
          params={{ id }}
          search={{ type: "packing-slip" }}
          className={`text-sm font-semibold ${!isInvoice ? "text-foreground" : "text-muted"}`}
        >
          Packing slip
        </Link>
        <Link
          to="/documents/$id"
          params={{ id }}
          search={{ type: "invoice" }}
          className={`text-sm font-semibold ${isInvoice ? "text-foreground" : "text-muted"}`}
        >
          Invoice
        </Link>
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => window.print()}
          disabled={isInvoice && !order.invoice}
        >
          Print
        </Button>
      </div>

      {isInvoice && !order.sellerConfigured && (
        <div className="mb-6 rounded-lg border border-danger/40 bg-danger/5 p-4 print:hidden">
          <Text className="text-sm font-semibold">
            Company details are not configured
          </Text>
          <Text muted className="mt-1 text-sm">
            Set <code>COMPANY_NAME</code>, <code>COMPANY_ADDRESS</code> and{" "}
            <code>COMPANY_CVR</code> on the API. A Danish invoice without a CVR
            number is not valid, so issuing is blocked until they are set.
          </Text>
        </div>
      )}

      {isInvoice && order.sellerConfigured && !order.invoice && (
        <div className="mb-6 rounded-lg border border-border bg-subtle/50 p-4 print:hidden">
          <Text className="text-sm font-semibold">
            No invoice number has been issued for this order
          </Text>
          <Text muted className="mt-1 mb-3 text-sm">
            Invoice numbers are sequential and permanent — issuing one cannot be
            undone, and the number is never reused.
          </Text>
          <Button
            size="sm"
            disabled={issue.isPending}
            onClick={() => issue.mutate()}
          >
            {issue.isPending ? "Issuing…" : "Issue invoice number"}
          </Button>
          {issue.isError && (
            <Text className="mt-2 text-sm text-danger">
              {issue.error.message}
            </Text>
          )}
        </div>
      )}

      {(!isInvoice || order.invoice) && (
        <Sheet order={order} isInvoice={isInvoice} />
      )}
    </div>
  );
}

function Sheet({ order, isInvoice }: { order: Order; isInvoice: boolean }) {
  const s = order.invoice?.seller ?? order.seller;
  const total = order.totalCents ?? order.subtotalCents;
  const net = total - (order.taxCents ?? 0);

  return (
    <article className="bg-paper text-foreground">
      <header className="mb-8 flex items-start justify-between gap-8">
        <div>
          <h1 className="text-2xl font-bold">
            {isInvoice ? "Faktura / Invoice" : "Følgeseddel / Packing slip"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Order {order.id.slice(-8).toUpperCase()}
            {isInvoice && order.invoice && ` · Invoice ${order.invoice.number}`}
          </p>
          <p className="text-sm text-muted">
            {new Date(
              isInvoice && order.invoice ? order.invoice.issuedAt : order.createdAt,
            ).toLocaleDateString("da-DK", { dateStyle: "long" })}
          </p>
        </div>
        <div className="text-right text-sm leading-relaxed">
          <p className="font-semibold">{s.name || "—"}</p>
          <p className="whitespace-pre-line text-muted">{s.address || "—"}</p>
          {s.cvr && <p className="text-muted">CVR {s.cvr}</p>}
          {s.email && <p className="text-muted">{s.email}</p>}
        </div>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-8 text-sm">
        <div>
          <p className="mb-1 font-semibold text-muted">Ship to</p>
          {order.ship.name ? (
            <address className="not-italic leading-relaxed">
              {order.ship.name}
              <br />
              {order.ship.line1}
              {order.ship.line2 && (
                <>
                  <br />
                  {order.ship.line2}
                </>
              )}
              <br />
              {order.ship.postalCode} {order.ship.city}
              <br />
              {order.ship.country}
            </address>
          ) : (
            <p className="text-muted">No address on this order.</p>
          )}
        </div>
        <div>
          <p className="mb-1 font-semibold text-muted">Contact</p>
          <p>{order.email ?? "—"}</p>
          {order.trackingNumber && (
            <>
              <p className="mt-3 mb-1 font-semibold text-muted">Tracking</p>
              <p>
                {order.trackingCarrier} {order.trackingNumber}
              </p>
            </>
          )}
        </div>
      </section>

      <table className="mb-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-border text-left">
            <th className="py-2 font-semibold">Item</th>
            <th className="py-2 font-semibold">SKU</th>
            <th className="py-2 text-right font-semibold">Qty</th>
            {/* A packing slip carries no prices: it goes in the box, and the
                person packing needs quantities, not amounts. */}
            {isInvoice && (
              <>
                <th className="py-2 text-right font-semibold">Unit</th>
                <th className="py-2 text-right font-semibold">Line</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {order.items.map((i) => (
            <tr key={i.id} className="border-b border-subtle">
              <td className="py-2">{i.name}</td>
              <td className="py-2 font-mono text-xs text-muted">{i.slug}</td>
              <td className="py-2 text-right tabular-nums">{i.quantity}</td>
              {isInvoice && (
                <>
                  <td className="py-2 text-right tabular-nums">
                    {formatPrice(i.unitPriceCents, i.currency)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatPrice(i.unitPriceCents * i.quantity, i.currency)}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {isInvoice && (
        <div className="ml-auto max-w-xs space-y-1 text-sm">
          <Line
            label="Net"
            value={formatPrice(net, order.currency)}
          />
          <Line
            label="Shipping"
            value={formatPrice(order.shippingCents, order.currency)}
          />
          <Line
            label="VAT 25%"
            value={formatPrice(order.taxCents ?? 0, order.currency)}
          />
          <div className="flex justify-between border-t-2 border-border pt-2 text-base font-bold">
            <span>Total</span>
            <span className="tabular-nums">
              {formatPrice(total, order.currency)}
            </span>
          </div>
          {order.refundedCents > 0 && (
            <p className="pt-2 text-xs text-muted">
              {formatPrice(order.refundedCents, order.currency)} of this invoice
              has since been refunded. A credit note covering the refunded
              amount belongs with this document.
            </p>
          )}
        </div>
      )}

      <footer className="mt-10 border-t border-border pt-4 text-xs text-muted">
        {isInvoice ? (
          <p>
            Amounts are in {order.currency} and include Danish VAT where
            applicable. {s.vatNumber && `VAT no. ${s.vatNumber}. `}
            Retain this document for your records.
          </p>
        ) : (
          <p>
            14-day right of withdrawal applies. Contact {s.email || "us"} to
            arrange a return.
          </p>
        )}
      </footer>
    </article>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
