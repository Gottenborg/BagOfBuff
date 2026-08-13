import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { paths } from "@repo/api-client";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Field,
  Heading,
  Input,
  Text,
} from "@repo/ui";
import { apiErrorMessage } from "../lib/errors";
import { formatDate, formatPrice } from "../lib/format";
import { api } from "../lib/api";

type Order =
  paths["/admin/orders/{id}"]["get"]["responses"][200]["content"]["application/json"];

const REASONS = [
  { value: "requested_by_customer", label: "Customer request / withdrawal" },
  { value: "duplicate", label: "Duplicate charge" },
  { value: "fraudulent", label: "Fraudulent" },
] as const;

function toCents(amount: string): number {
  return Math.round(Number(amount.replace(",", ".")) * 100);
}

/**
 * Refunds for one order.
 *
 * Refunding is irreversible and moves real money, so the outstanding balance is
 * shown up front, the amount defaults to a full refund, and the button states
 * exactly what will be sent back before it is pressed.
 */
export function RefundPanel({
  order,
  onRefunded,
}: {
  order: Order;
  onRefunded: () => void;
}) {
  const captured = order.totalCents ?? order.subtotalCents;
  const outstanding = captured - order.refundedCents;

  const [amount, setAmount] = useState("");
  const [reason, setReason] =
    useState<(typeof REASONS)[number]["value"]>("requested_by_customer");
  const [note, setNote] = useState("");
  const [restock, setRestock] = useState(true);
  const [confirming, setConfirming] = useState(false);

  // Blank means "everything still outstanding", which is the common case.
  const amountCents = amount.trim() ? toCents(amount) : outstanding;
  const overAmount = amountCents > outstanding;
  const invalidAmount = !Number.isFinite(amountCents) || amountCents <= 0;

  const refund = useMutation({
    mutationFn: async () => {
      const { error, response } = await api.POST("/admin/orders/{id}/refund", {
        params: { path: { id: order.id } },
        body: {
          amountCents: amount.trim() ? amountCents : null,
          reason,
          note: note.trim() ? note : null,
          restock,
        },
      });
      if (error)
        throw new Error(
          apiErrorMessage(error, response, "Could not issue the refund."),
        );
    },
    onSuccess: () => {
      setAmount("");
      setNote("");
      setConfirming(false);
      onRefunded();
    },
  });

  const refundable =
    (order.status === "paid" || order.status === "fulfilled") && outstanding > 0;

  return (
    <Card className="mt-6">
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Heading level={3} size={4}>
            Refunds
          </Heading>
          {order.refundedCents > 0 && (
            <Badge variant="danger">
              {formatPrice(order.refundedCents, order.currency)} refunded
            </Badge>
          )}
          <Text muted className="text-sm">
            {outstanding > 0
              ? `${formatPrice(outstanding, order.currency)} still refundable`
              : "Fully refunded"}
          </Text>
        </div>

        {order.refunds.length > 0 && (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-2 font-semibold">Date</th>
                <th className="py-2 font-semibold">Amount</th>
                <th className="py-2 font-semibold">Reason</th>
                <th className="py-2 font-semibold">Note</th>
                <th className="py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {order.refunds.map((r) => (
                <tr key={r.id} className="border-b border-subtle last:border-0">
                  <td className="py-2 whitespace-nowrap text-muted">
                    {formatDate(r.createdAt)}
                  </td>
                  <td className="py-2 tabular-nums">
                    {formatPrice(r.amountCents, r.currency)}
                  </td>
                  <td className="py-2 text-muted">
                    {r.reason.replace(/_/g, " ")}
                  </td>
                  <td className="py-2 text-muted">{r.note ?? "—"}</td>
                  <td className="py-2">
                    <Badge
                      variant={
                        r.status === "succeeded"
                          ? "success"
                          : r.status === "failed"
                            ? "danger"
                            : "neutral"
                      }
                    >
                      {r.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!refundable ? (
          <Text muted className="text-sm">
            {order.status === "paid" || order.status === "fulfilled"
              ? "Nothing left to refund on this order."
              : `An order that is ${order.status} cannot be refunded.`}
          </Text>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              // Two steps, because this cannot be undone.
              if (!confirming) {
                setConfirming(true);
                return;
              }
              refund.mutate();
            }}
            className="space-y-3 border-t border-border pt-4"
          >
            <div className="flex flex-wrap items-start gap-3">
              <Field
                label={`Amount (${order.currency})`}
                htmlFor="refund-amount"
                className="w-40"
                hint={`Blank = full ${formatPrice(outstanding, order.currency)}`}
              >
                <Input
                  id="refund-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  placeholder={(outstanding / 100).toFixed(2)}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setConfirming(false);
                  }}
                />
              </Field>
              <Field label="Reason" htmlFor="refund-reason" className="w-56">
                <select
                  id="refund-reason"
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value as typeof reason);
                    setConfirming(false);
                  }}
                  className="h-10 rounded-md border border-border bg-paper px-3 text-sm"
                >
                  {REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Internal note"
                htmlFor="refund-note"
                className="w-64"
                hint="Not sent to the customer"
              >
                <Input
                  id="refund-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
            </div>

            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={restock}
                onChange={(e) => setRestock(e.target.checked)}
              />
              Return the items to sellable stock
              <span className="text-muted">
                — uncheck if the goods came back damaged or unsealed
              </span>
            </label>

            {overAmount && (
              <Text className="text-sm text-danger">
                That is more than the{" "}
                {formatPrice(outstanding, order.currency)} still outstanding.
              </Text>
            )}

            <div className="flex items-center gap-3">
              <Button
                type="submit"
                variant={confirming ? "danger" : "secondary"}
                disabled={refund.isPending || overAmount || invalidAmount}
              >
                {refund.isPending
                  ? "Refunding…"
                  : confirming
                    ? `Confirm — send back ${formatPrice(amountCents, order.currency)}`
                    : "Refund…"}
              </Button>
              {confirming && !refund.isPending && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </Button>
              )}
              {confirming && (
                <Text className="text-sm text-muted">
                  This cannot be undone.
                </Text>
              )}
            </div>

            {refund.isError && (
              <Text className="text-sm text-danger">
                {refund.error.message}
              </Text>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
