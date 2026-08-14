import { useQuery } from "@tanstack/react-query";
import { Text } from "@repo/ui";
import { api } from "../lib/api";

/**
 * EU OSS threshold warning.
 *
 * We charge Danish VAT on all EU sales, which is only correct below €10,000 of
 * cross-border B2C sales per year. Crossing it silently means under-charging
 * VAT and owing the difference, so this appears from 80% — quiet until it
 * matters, impossible to miss once it does.
 */
export function OssNotice() {
  const { data } = useQuery({
    queryKey: ["oss-status"],
    queryFn: async () => {
      const { data, error } = await api.GET("/admin/tax/oss", {});
      // A missing threshold reading must never block the orders screen.
      if (error) return null;
      return data;
    },
    // It moves with sales, not with page views.
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (!data || !data.approaching) return null;

  const euros = (data.crossBorderEurCents / 100).toLocaleString("da-DK", {
    style: "currency",
    currency: "EUR",
  });
  const percent = Math.round(data.ratio * 100);

  return (
    <div
      className={`mb-6 rounded-lg border px-4 py-3 ${
        data.exceeded
          ? "border-danger/40 bg-danger/5"
          : "border-brand/40 bg-brand/5"
      }`}
    >
      <Text className="text-sm font-semibold">
        {data.exceeded
          ? "EU OSS threshold passed — VAT rates need changing"
          : `Approaching the EU OSS threshold (${percent}%)`}
      </Text>
      <Text muted className="mt-1 text-sm">
        Cross-border EU sales this year: {euros} of €10,000. {" "}
        {data.exceeded
          ? "Sales to other EU countries must now carry the destination country's VAT rate, not Denmark's 25%. Register for OSS and enable destination rates."
          : "Past €10,000 each EU sale must carry the destination country's VAT rate instead of Denmark's 25%."}
      </Text>
    </div>
  );
}
