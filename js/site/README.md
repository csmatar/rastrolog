# @rastrolog/site

The rastrolog landing page: a static Astro site with a robots.txt checker and a log analyzer, in English (`/`) and Spanish (`/es/`). Both tools run in the visitor's browser; the only thing the page sends anywhere is an email address, after a visitor submits one.

## Develop

From `js/`:

```bash
pnpm install
pnpm --filter rastrolog run build            # the page serves the built snippet
pnpm --filter @rastrolog/site run dev         # http://localhost:4321
pnpm --filter @rastrolog/site run test        # unit tests
pnpm --filter @rastrolog/site run build && pnpm --filter @rastrolog/site run e2e
pnpm --filter @rastrolog/site run lhci        # Lighthouse budgets (after a build)
