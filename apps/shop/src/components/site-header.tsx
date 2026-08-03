import { Link } from "@tanstack/react-router";
import { useCartCount } from "../lib/cart";

export function SiteHeader() {
  const count = useCartCount();
  return (
    <header className="border-b border-neutral-200">
      <div className="mx-auto flex max-w-5xl items-center justify-between p-4">
        <Link to="/" className="text-lg font-bold tracking-tight">
          Bag of Buff
        </Link>
        <Link
          to="/"
          className="relative text-sm text-neutral-600 hover:text-neutral-900"
        >
          Cart
          {count > 0 && (
            <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-neutral-900 px-1 text-xs font-medium text-white">
              {count}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
