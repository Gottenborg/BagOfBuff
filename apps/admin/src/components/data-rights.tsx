import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button, Card, CardContent, Heading, Input, Text } from "@repo/ui";
import { apiErrorMessage } from "../lib/errors";
import { api } from "../lib/api";

/**
 * GDPR data-subject rights for one customer.
 *
 * The privacy policy promises these; until now they needed raw SQL. Erasure is
 * separated behind a typed confirmation because it cannot be undone and,
 * unusually, *should not* be undoable — a reversible erasure isn't one.
 */
export function DataRights({
  email,
  onErased,
}: {
  email: string;
  onErased: () => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const exportData = useMutation({
    mutationFn: async () => {
      const { data, error, response } = await api.GET(
        "/admin/customers/{email}/export",
        { params: { path: { email } } },
      );
      if (error)
        throw new Error(
          apiErrorMessage(error, response, "Could not export the data."),
        );
      return data;
    },
    onSuccess: (data) => {
      // Hand the operator a file they can send on — a subject-access request
      // is answered with a document, not a screenful of JSON.
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bagofbuff-data-${email.replace(/[^a-z0-9]/gi, "-")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice("Export downloaded.");
    },
  });

  const erase = useMutation({
    mutationFn: async () => {
      const { data, error, response } = await api.POST(
        "/admin/customers/{email}/erase",
        { params: { path: { email } } },
      );
      if (error)
        throw new Error(
          apiErrorMessage(error, response, "Could not erase the data."),
        );
      return data;
    },
    onSuccess: (data) => {
      setNotice(data?.message ?? "Personal data erased.");
      setConfirmation("");
      onErased();
    },
  });

  const canErase = confirmation.trim().toLowerCase() === email.toLowerCase();

  return (
    <Card className="mt-6">
      <CardContent className="space-y-5">
        <Heading level={3} size={4}>
          Data rights
        </Heading>

        <div className="space-y-1">
          <Button
            variant="secondary"
            disabled={exportData.isPending}
            onClick={() => {
              setNotice(null);
              exportData.mutate();
            }}
          >
            {exportData.isPending ? "Preparing…" : "Download all data (JSON)"}
          </Button>
          <Text muted className="text-xs">
            Answers an access or portability request (GDPR arts. 15 and 20):
            orders, items, refunds, invoices, subscriptions and order history.
          </Text>
          {exportData.isError && (
            <Text className="text-sm text-danger">
              {exportData.error.message}
            </Text>
          )}
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <Text className="text-sm font-semibold">
            Erase personal data (art. 17)
          </Text>
          <Text muted className="text-xs">
            Names, addresses and email are overwritten. Amounts, VAT, dates and
            invoice numbers are <strong>kept</strong> — bookkeeping law requires
            the financial record for five years, and art. 17(3)(b) exempts it.
            This cannot be undone.
          </Text>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              value={confirmation}
              placeholder={`Type ${email} to confirm`}
              aria-label="Type the customer's email to confirm erasure"
              className="w-80"
              onChange={(e) => setConfirmation(e.target.value)}
            />
            <Button
              variant="danger"
              disabled={!canErase || erase.isPending}
              onClick={() => {
                setNotice(null);
                erase.mutate();
              }}
            >
              {erase.isPending ? "Erasing…" : "Erase personal data"}
            </Button>
          </div>
          {erase.isError && (
            <Text className="text-sm text-danger">{erase.error.message}</Text>
          )}
        </div>

        {notice && <Text className="text-sm text-success">{notice}</Text>}
      </CardContent>
    </Card>
  );
}
