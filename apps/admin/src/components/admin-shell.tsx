import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Button, Container, Heading, Loading, Logo, Text } from "@repo/ui";
import { LoginForm } from "./login-form";
import { signOut, useSession } from "../lib/auth";

const NAV = [
  { to: "/", label: "Catalogue" },
  { to: "/orders", label: "Orders" },
  { to: "/customers", label: "Customers" },
  { to: "/subscriptions", label: "Subscriptions" },
  { to: "/plans", label: "Plans" },
] as const;

/**
 * Auth-gated back-office chrome: shows the login form until there's a session,
 * then wraps the page in the shared header + primary navigation. Every admin
 * route renders through this so the gate and nav stay consistent.
 */
export function AdminShell({
  subtitle,
  children,
}: {
  subtitle?: string;
  children: ReactNode;
}) {
  const { session, loading } = useSession();
  if (loading) return <Loading className="p-8" />;
  if (!session) return <LoginForm />;

  return (
    <Container as="main" size="xl" className="py-10">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo markOnly />
          <div>
            <Heading level={1} size={3}>
              Back office
            </Heading>
            {subtitle && (
              <Text muted className="text-sm">
                {subtitle}
              </Text>
            )}
          </div>
        </div>
        <div className="flex items-center gap-6">
          <nav className="flex items-center gap-4 text-sm font-semibold">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="text-muted transition-colors hover:text-foreground"
                activeProps={{ className: "text-foreground" }}
                activeOptions={{ exact: item.to === "/" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Button variant="ghost" onClick={() => signOut()}>
            Sign out
          </Button>
        </div>
      </header>
      {children}
    </Container>
  );
}
