import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button, Container, Field, Heading, Input, Text } from "@repo/ui";
import { SiteHeader } from "../components/site-header";
import { api } from "../lib/api";

export const Route = createFileRoute("/account")({ component: Account });

function Account() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    // The API always responds generically; a failure here is only a network
    // error, so we still show the same confirmation.
    await api.POST("/account/portal", { body: { email: email.trim() } });
    setSubmitting(false);
    setSent(true);
  }

  return (
    <>
      <SiteHeader />
      <Container as="main" size="sm" className="py-12">
        <Heading level={1} size={2}>
          Manage your subscription
        </Heading>
        <Text muted className="mt-3">
          Enter your email and we'll send you a secure link to manage, pause, or
          cancel your subscription and update your payment details.
        </Text>

        {sent ? (
          <Text className="mt-8 rounded-md border border-border bg-subtle/40 p-4">
            If that email has a subscription, a management link is on its way.
            Check your inbox.
          </Text>
        ) : (
          <form onSubmit={submit} className="mt-8 flex items-end gap-3">
            <Field label="Email" htmlFor="account-email" className="flex-1">
              <Input
                id="account-email"
                type="email"
                required
                value={email}
                placeholder="you@example.com"
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Button type="submit" disabled={submitting || !email.trim()}>
              {submitting ? "Sending…" : "Send link"}
            </Button>
          </form>
        )}
      </Container>
    </>
  );
}
