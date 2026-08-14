import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { paths } from "@repo/api-client";
import { Button, Card, CardContent, Field, Heading, Input, Text } from "@repo/ui";
import { apiErrorMessage } from "../lib/errors";
import { api } from "../lib/api";

type Order =
  paths["/admin/orders/{id}"]["get"]["responses"][200]["content"]["application/json"];

/**
 * The two support actions that aren't fulfillment or refunding: stopping an
 * order before it ships, and sending the confirmation again.
 */
export function OrderActions({
  order,
  onChanged,
}: {
  order: Order;
  onChanged: () => void;
}) {
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [restock, setRestock] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const paid = order.status === "paid" || order.status === "fulfilled";
  const outstanding =
    (order.totalCents ?? order.subtotalCents) - order.refundedCents;
  const cancellable =
    order.status !== "canceled" &&
    order.status !== "refunded" &&
    order.fulfillmentStatus !== "shipped";

  const resend = useMutation({
    mutationFn: async () => {
      const { data, error, response } = await api.POST(
        "/admin/orders/{id}/resend-confirmation",
        {
          params: { path: { id: order.id } },
          body: { email: email.trim() ? email.trim() : null },
        },
      );
      if (error)
        throw new Error(
          apiErrorMessage(error, response, "Could not send the confirmation."),
        );
      return data;
    },
    onSuccess: (data) => {
      setNotice(data?.message ?? "Confirmation sent.");
      setEmail("");
      onChanged();
    },
  });

  const cancel = useMutation({
    mutationFn: async () => {
      const { data, error, response } = await api.POST(
        "/admin/orders/{id}/cancel",
        {
          params: { path: { id: order.id } },
          body: {
            refund: paid && outstanding > 0,
            restock,
            reason: reason.trim() ? reason.trim() : null,
          },
        },
      );
      if (error)
        throw new Error(
          apiErrorMessage(error, response, "Could not cancel the order."),
        );
      return data;
    },
    onSuccess: (data) => {
      setNotice(data?.message ?? "Order canceled.");
      setConfirmingCancel(false);
      setReason("");
      onChanged();
    },
  });

  return (
    <Card className="mt-6">
      <CardContent className="space-y-5">
        <Heading level={3} size={4}>
          Actions
        </Heading>

        {/* Documents */}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/documents/$id"
            params={{ id: order.id }}
            search={{ type: "packing-slip" as const }}
            className="text-sm font-semibold text-brand-strong hover:underline"
          >
            Packing slip →
          </Link>
          <Link
            to="/documents/$id"
            params={{ id: order.id }}
            search={{ type: "invoice" as const }}
            className="text-sm font-semibold text-brand-strong hover:underline"
          >
            Invoice{order.invoice ? ` ${order.invoice.number}` : ""} →
          </Link>
          {!order.invoice && (
            <Text muted className="text-xs">
              No invoice number issued yet
            </Text>
          )}
        </div>

        {/* Resend confirmation */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-start gap-3">
            <Field
              label="Resend confirmation to"
              htmlFor="resend-email"
              className="w-72"
              hint={
                order.email
                  ? `Blank sends to ${order.email}`
                  : "This order has no email address"
              }
            >
              <Input
                id="resend-email"
                type="email"
                value={email}
                placeholder={order.email ?? "customer@example.com"}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <div className="pt-[1.375rem]">
              <Button
                variant="secondary"
                disabled={resend.isPending}
                onClick={() => {
                  setNotice(null);
                  resend.mutate();
                }}
              >
                {resend.isPending ? "Sending…" : "Send"}
              </Button>
            </div>
          </div>
          <Text muted className="text-xs">
            A different address is saved to the order too — resending to the same
            wrong address helps nobody.
          </Text>
          {resend.isError && (
            <Text className="text-sm text-danger">{resend.error.message}</Text>
          )}
        </div>

        {/* Cancel */}
        <div className="space-y-2 border-t border-border pt-4">
          {!cancellable ? (
            <Text muted className="text-sm">
              {order.fulfillmentStatus === "shipped"
                ? "This order has shipped. Handle it as a return using the refund panel above."
                : `An order that is ${order.status} cannot be canceled.`}
            </Text>
          ) : (
            <>
              <div className="flex flex-wrap items-start gap-3">
                <Field
                  label="Cancel this order"
                  htmlFor="cancel-reason"
                  className="w-72"
                  hint="Reason is recorded in the history"
                >
                  <Input
                    id="cancel-reason"
                    value={reason}
                    placeholder="Customer changed their mind"
                    onChange={(e) => {
                      setReason(e.target.value);
                      setConfirmingCancel(false);
                    }}
                  />
                </Field>
                <div className="pt-[1.375rem]">
                  <Button
                    variant={confirmingCancel ? "danger" : "secondary"}
                    disabled={cancel.isPending}
                    onClick={() => {
                      setNotice(null);
                      if (!confirmingCancel) {
                        setConfirmingCancel(true);
                        return;
                      }
                      cancel.mutate();
                    }}
                  >
                    {cancel.isPending
                      ? "Cancelling…"
                      : confirmingCancel
                        ? paid && outstanding > 0
                          ? "Confirm — cancel and refund in full"
                          : "Confirm — cancel this order"
                        : "Cancel order…"}
                  </Button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={restock}
                  onChange={(e) => setRestock(e.target.checked)}
                />
                Return the items to sellable stock
              </label>

              {paid && outstanding > 0 && (
                <Text muted className="text-xs">
                  This order is paid, so cancelling also refunds the full
                  outstanding balance.
                </Text>
              )}
              {cancel.isError && (
                <Text className="text-sm text-danger">
                  {cancel.error.message}
                </Text>
              )}
            </>
          )}
        </div>

        {notice && <Text className="text-sm text-success">{notice}</Text>}
      </CardContent>
    </Card>
  );
}
