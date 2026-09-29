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
```

## Configuration

Build-time environment variables. They're all public, because they end up in the HTML.

| Variable | Default | What it is |
| --- | --- | --- |
| `SITE_URL` | `http://localhost:4321` | The site's origin, for canonical and hreflang links |
| `KIT_FORM_GENERAL` | `test-general` | Kit form ID for everyone else |
| `KIT_FORM_LATAM` | `test-latam` | Kit form ID for LATAM builders (preselected on `/es/`) |
| `RASTROLOG_SITE_RELEASE` | unset | `1` makes the three above required |

Articles and the video ID are constants in `site.config.ts`. Their section stays hidden until one is set.

Cloudflare Web Analytics isn't in the HTML: Cloudflare Pages injects it when it's switched on for the project.

## Kit setup (once, in the Kit dashboard)

1. Create two forms, "General developers" and "LATAM builders". Each applies its own tag, and both have double opt-in on.
2. Add a custom field named exactly `checked_domain`.
3. In the "General developers" confirmation email body, add:

   ```liquid
   {% if subscriber.checked_domain %}Your report: https://<site>/?check={{ subscriber.checked_domain }}{% endif %}
   ```

   In the "LATAM builders" one, use `Tu reporte: https://<site>/es/?check={{ subscriber.checked_domain }}` inside the same `if`.
4. Put the two form IDs in `KIT_FORM_GENERAL` and `KIT_FORM_LATAM`.
5. Open one form's HTML embed code and confirm its `action` is `https://app.kit.com/forms/<id>/subscriptions`. If Kit has changed it, update `KIT_FORM_BASE` in `src/lib/kit.ts` and its tests.
