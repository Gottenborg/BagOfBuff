import type { paths } from "@repo/api-client";
import { Card, CardContent, Heading, Text } from "@repo/ui";

type Order =
  paths["/admin/orders/{id}"]["get"]["responses"][200]["content"]["application/json"];
type Event = Order["events"][number];

/** Colour by consequence, not by category — red is money leaving or a failure. */
const TONE: Record<string, string> = {
  "order.created": "bg-ink-300",
  "order.paid": "bg-success",
  "order.expired": "bg-ink-400",
  "order.canceled": "bg-ink-400",
  "fulfillment.changed": "bg-brand",
  "tracking.changed": "bg-brand",
  "refund.requested": "bg-danger",
  "refund.settled": "bg-danger",
  "refund.failed": "bg-danger",
  "email.sent": "bg-ink-300",
  "email.failed": "bg-danger",
};

/** Who did it, in words rather than an opaque id. */
function actorLabel(event: Event): string {
  if (event.actorEmail) return event.actorEmail;
  switch (event.actor) {
    case "stripe":
      return "Stripe";
    case "customer":
      return "Customer";
    case "system":
      return "System";
    default:
      // An admin whose email we never captured — still better than nothing.
      return `Admin ${event.actor.slice(0, 8)}`;
  }
}

function timestamp(iso: string): string {
  return new Date(iso).toLocaleString("da-DK", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * The order's history.
 *
 * Oldest first, because this is read as a story of what happened rather than a
 * feed of the latest news — and when reconciling a dispute, the sequence is the
 * whole point.
 */
export function OrderHistory({ events }: { events: Event[] }) {
  return (
    <Card className="mt-6">
      <CardContent>
        <Heading level={3} size={4} className="mb-4">
          History
        </Heading>

        {events.length === 0 ? (
          <Text muted className="text-sm">
            Nothing recorded yet. Orders placed before history was added have no
            entries — this is not a gap in what happened, only in what was
            written down.
          </Text>
        ) : (
          <ol className="relative space-y-4 border-l border-border pl-5">
            {events.map((event) => (
              <li key={event.id} className="relative">
                <span
                  className={`absolute -left-[1.5625rem] top-1.5 h-2 w-2 rounded-full ${
                    TONE[event.type] ?? "bg-ink-300"
                  }`}
                  aria-hidden
                />
                <Text className="text-sm">{event.message}</Text>
                <Text muted className="mt-0.5 text-xs">
                  {timestamp(event.createdAt)} · {actorLabel(event)}
                </Text>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
