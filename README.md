# Back of Buff

Monorepo for the Back of Buff project, managed with [Turborepo](https://turborepo.dev) and [Bun](https://bun.sh).

## Structure

- `apps/*` — applications (empty for now, add as they're built)
- `packages/eslint-config` — shared ESLint configuration
- `packages/typescript-config` — shared `tsconfig.json` base
- `packages/*` — additional shared packages, add as needed

## Commands

```sh
bun install       # install dependencies
bun run build     # build all apps and packages
bun run dev       # develop all apps and packages
bun run lint      # lint all apps and packages
bun run check-types  # type-check all apps and packages
bun run format    # format with prettier
```

You can scope any command to a single package with a [filter](https://turborepo.dev/docs/crafting-your-repository/running-tasks#using-filters), e.g. `bun run build --filter=<package-name>`.

## Remote Caching

Turborepo caches locally by default. To share the cache across machines/CI, connect to [Vercel Remote Cache](https://turborepo.dev/docs/core-concepts/remote-caching):

```sh
bunx turbo login
bunx turbo link
```
