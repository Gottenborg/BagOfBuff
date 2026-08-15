import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Field, Input, Loading, Text } from "@repo/ui";
import { apiErrorMessage } from "../lib/errors";
import { formatDate } from "../lib/format";
import { api } from "../lib/api";

const REASONS = [
  { value: "received", label: "Delivery received", sign: 1 },
  { value: "count", label: "Stock count correction", sign: 0 },
  { value: "damaged", label: "Damaged / expired", sign: -1 },
  { value: "adjustment", label: "Other adjustment", sign: 0 },
] as const;

const REASON_LABEL: Record<string, string> = {
  received: "Received",
  sale: "Sold",
  return: "Returned",
  count: "Count",
  damaged: "Damaged",
  adjustment: "Adjustment",
};

/**
 * Stock movements for one product.
 *
 * The quantity field on the product form answers "how many", this answers "why"
 * — which is the question that matters the first time a physical count
 * disagrees with the system.
 */
export function StockPanel({ productId }: { productId: string }) {
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<(typeof REASONS)[number]["value"]>(
    "received",
  );
  const [note, setNote] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["stock", productId],
    queryFn: async () => {
      const { data, error, response } = await api.GET(
        "/admin/stock/{id}",
        { params: { path: { id: productId } } },
      );
      if (error)
        throw new Error(
          apiErrorMessage(error, response, "Could not load stock movements."),
        );
      return data;
    },
  });

  const record = useMutation({
    mutationFn: async () => {
      const n = Number(quantity);
      const selected = REASONS.find((r) => r.value === reason)!;
      // "Damaged" is always a removal however it's typed; "received" always an
      // addition. Corrections keep whatever sign was entered.
      const delta =
        selected.sign === 0 ? n : Math.abs(n) * selected.sign;
      const { error, response } = await api.POST("/admin/stock/{id}", {
        params: { path: { id: productId } },
        body: { delta, reason, note: note.trim() || null },
      });
      if (error)
        throw new Error(
          apiErrorMessage(error, response, "Could not record the movement."),
        );
    },
    onSuccess: () => {
      setQuantity("");
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["stock", productId] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const selected = REASONS.find((r) => r.value === reason)!;

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Text className="text-sm font-semibold">Stock movements</Text>
        {data && (
          <>
            <Badge variant="neutral">{data.stock} in stock</Badge>
            {data.unexplained !== 0 && (
              <Badge variant="danger">
                {data.unexplained > 0 ? "+" : ""}
                {data.unexplained} unexplained
              </Badge>
            )}
          </>
        )}
      </div>

      {data && data.unexplained !== 0 && (
        <Text muted className="mb-3 block text-xs">
          The balance and the ledger disagree by {data.unexplained}. That is
          expected for stock set before movements were recorded; a later
          discrepancy means something changed the number directly in the
          database. Record a count correction to bring them back in line.
        </Text>
      )}

      <form
        className="mb-4 flex flex-wrap items-start gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          record.mutate();
        }}
      >
        <Field
          label="Quantity"
          htmlFor={`stock-qty-${productId}`}
          className="w-28"
          hint={
            selected.sign === 0 ? "Use − to remove" : selected.sign > 0 ? "Added" : "Removed"
          }
        >
          <Input
            id={`stock-qty-${productId}`}
            type="number"
            step="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
        </Field>
        <Field label="Reason" htmlFor={`stock-reason-${productId}`} className="w-56">
          <select
            id={`stock-reason-${productId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value as typeof reason)}
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
          label="Note"
          htmlFor={`stock-note-${productId}`}
          className="w-64"
          hint="Supplier, batch, or what happened"
        >
          <Input
            id={`stock-note-${productId}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <div className="pt-[1.375rem]">
          <Button
            type="submit"
            variant="secondary"
            disabled={record.isPending || !quantity.trim()}
          >
            {record.isPending ? "Recording…" : "Record"}
          </Button>
        </div>
      </form>

      {record.isError && (
        <Text className="mb-3 text-sm text-danger">{record.error.message}</Text>
      )}

      {isLoading && <Loading />}
      {data && data.movements.length === 0 && (
        <Text muted className="text-sm">
          No movements recorded yet.
        </Text>
      )}
      {data && data.movements.length > 0 && (
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="py-2 font-semibold">When</th>
              <th className="py-2 font-semibold">Change</th>
              <th className="py-2 font-semibold">After</th>
              <th className="py-2 font-semibold">Reason</th>
              <th className="py-2 font-semibold">Note</th>
              <th className="py-2 font-semibold">By</th>
            </tr>
          </thead>
          <tbody>
            {data.movements.map((m) => (
              <tr key={m.id} className="border-b border-subtle last:border-0">
                <td className="py-2 whitespace-nowrap text-muted">
                  {formatDate(m.createdAt)}
                </td>
                <td
                  className={`py-2 tabular-nums font-semibold ${
                    m.delta > 0 ? "text-success" : "text-danger"
                  }`}
                >
                  {m.delta > 0 ? "+" : ""}
                  {m.delta}
                </td>
                <td className="py-2 tabular-nums text-muted">
                  {m.balanceAfter}
                </td>
                <td className="py-2">{REASON_LABEL[m.reason] ?? m.reason}</td>
                <td className="py-2 text-muted">{m.note ?? "—"}</td>
                <td className="py-2 text-muted">
                  {m.actorEmail ?? (m.actor === "system" ? "System" : "Admin")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
