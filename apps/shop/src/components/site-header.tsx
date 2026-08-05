import { Link } from "@tanstack/react-router";
import { Badge, Container, Logo } from "@repo/ui";
import { useCartCount } from "../lib/cart";

export function SiteHeader() {
  const count = useCartCount();
  return (
    <header className="border-b border-border bg-paper/80 backdrop-blur">
      <Container size="lg" className="flex items-center justify-between py-4">
        <Link to="/" aria-label="Bag of Buff home">
          <Logo />
        </Link>
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted transition-colors hover:text-foreground"
        >
          Cart
          {count > 0 && <Badge variant="brand">{count}</Badge>}
        </Link>
      </Container>
    </header>
  );
}
