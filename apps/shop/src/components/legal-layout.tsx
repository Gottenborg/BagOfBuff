import type { ReactNode } from "react";
import { Container, Heading } from "@repo/ui";
import { SiteHeader } from "./site-header";

/** Shared chrome + readable prose column for the legal/policy pages. */
export function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <Container as="main" size="md" className="py-12">
        <Heading level={1} size={2}>
          {title}
        </Heading>
        {updated && (
          <p className="mt-2 text-sm text-muted">Last updated: {updated}</p>
        )}
        <div className="prose-legal mt-8 space-y-4 text-ink-700 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_ul]:list-disc [&_ul]:pl-6 [&_a]:text-brand-strong [&_a]:underline">
          {children}
        </div>
      </Container>
    </>
  );
}
