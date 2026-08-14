import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards the file-routing convention that silently broke order and customer
 * detail pages.
 *
 * TanStack Router's file routing treats `orders.tsx` as the *parent layout* of
 * `orders.$id.tsx`. A parent that doesn't render an `<Outlet />` swallows its
 * children: the URL changes, the child never mounts, and the parent stays on
 * screen — so clicking through looks like a dead link with no error anywhere.
 *
 * The fix is to name a leaf page `orders.index.tsx`, which makes it a sibling
 * of `orders.$id.tsx` rather than its parent. This asserts that every route
 * file with children either is a real layout (renders an Outlet) or doesn't
 * claim to be a parent at all.
 */

const ROUTES_DIR = import.meta.dir;

function routeFiles(): string[] {
  return readdirSync(ROUTES_DIR).filter(
    (f) => f.endsWith(".tsx") && !f.startsWith("__"),
  );
}

/** "orders.$id.tsx" -> "orders"; "orders.tsx" -> "orders". */
function segmentPrefix(file: string): string {
  return file.replace(/\.tsx$/, "").split(".")[0]!;
}

describe("file-based routing", () => {
  test("a route file with children renders an Outlet", () => {
    const files = routeFiles();
    const offenders: string[] = [];

    for (const file of files) {
      const name = file.replace(/\.tsx$/, "");
      // Only plain, single-segment names can become accidental parents.
      if (name.includes(".")) continue;

      const hasChildren = files.some(
        (other) => other !== file && segmentPrefix(other) === name,
      );
      if (!hasChildren) continue;

      const source = readFileSync(join(ROUTES_DIR, file), "utf8");
      if (!source.includes("<Outlet")) {
        offenders.push(
          `${file} is the parent of ${name}.* routes but renders no <Outlet />, ` +
            `so those pages can never appear. Rename it to ${name}.index.tsx.`,
        );
      }
    }

    expect(offenders).toEqual([]);
  });

  test("the detail pages that regressed are siblings, not children", () => {
    const files = routeFiles();
    // Named explicitly: these are the two that shipped broken.
    expect(files).toContain("orders.index.tsx");
    expect(files).toContain("orders.$id.tsx");
    expect(files).not.toContain("orders.tsx");
    expect(files).toContain("customers.index.tsx");
    expect(files).toContain("customers.$email.tsx");
    expect(files).not.toContain("customers.tsx");
  });
});
