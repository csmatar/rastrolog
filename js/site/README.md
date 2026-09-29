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
| `SITE_URL` | Pages' `CF_PAGES_URL`, else `http://localhost:4321` | The site's origin, for canonical and hreflang links |
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

## Deploy

Cloudflare Pages builds and deploys this site through its Git integration. GitHub holds no Cloudflare credentials, and no workflow deploys anything.
- A merge to `main` that touches `js/**`, `signals.json` or `README.md` deploys `https://rastrolog.com`.
- Every PR gets a preview URL. Cloudflare marks previews `noindex`.

### Pages project settings

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | `js` |
| Build command | `pnpm install --frozen-lockfile && pnpm --filter rastrolog run build && pnpm --filter @rastrolog/site run build` |
| Build output directory | `site/dist` |
| Build watch paths (include) | `js/**`, `signals.json`, `README.md` |

Variables for both environments:

| Variable | Value |
| --- | --- |
| `NODE_VERSION` | `24` |
| `PNPM_VERSION` | `11.27.1` |
| `SKIP_DEPENDENCY_INSTALL` | `1` |

`PNPM_VERSION` must equal `packageManager` in `js/package.json`; `test/deploy-docs.test.ts` checks it. `SKIP_DEPENDENCY_INSTALL` keeps Pages from running its own install before the build command.

Production only: `SITE_URL=https://rastrolog.com`, `KIT_FORM_GENERAL`, `KIT_FORM_LATAM` and `RASTROLOG_SITE_RELEASE=1`. Previews get none of these: `site.config.ts` takes the preview's own URL from `CF_PAGES_URL`, and the placeholder Kit IDs make preview signups fail harmlessly.

`public/_headers` sets the production headers (CSP, HSTS and the rest). The e2e suite serves every page under the same CSP.

### Launch checklist (once)

1. **Kit.** Do the "Kit setup" above: two forms, the `checked_domain` field, and the report link in both confirmation emails. Note both form IDs. The production build fails without them.
2. **Cloudflare zone.** In Cloudflare, add the site `rastrolog.com` on the Free plan. Before switching nameservers, make the zone's DNS match these records exactly:

   | Type | Name | Content | Proxy |
   | --- | --- | --- | --- |
   | MX | `rastrolog.com` | `fwd1.porkbun.com`, priority 10 | DNS only |
   | MX | `rastrolog.com` | `fwd2.porkbun.com`, priority 20 | DNS only |
   | TXT | `rastrolog.com` | `v=spf1 include:_spf.porkbun.com ~all` | DNS only |
   | A | `www` | `192.0.2.1` | Proxied |

   Delete anything else Cloudflare imported from Porkbun: the apex `ALIAS`/`A`, the `*` CNAME, and the two `_acme-challenge` TXT records.
3. **Nameservers.** In Porkbun (Domain Management, then Authoritative Nameservers), replace Porkbun's nameservers with the two Cloudflare shows. Wait for Cloudflare to report the zone active.
4. **Pages project.** In Workers & Pages, choose Create, then Pages, then Connect to Git. When GitHub asks, grant the Cloudflare app access to `csmatar/rastrolog` only. Name the project `rastrolog`, then enter the settings and variables above.
5. **Custom domain.** In the project, go to Custom domains and add `rastrolog.com`.
6. **www redirect.** Under Rules, create a Bulk Redirect list with one entry: `www.rastrolog.com` to `https://rastrolog.com`, status 301, with preserve query string, subpath matching, preserve path suffix and include subdomains all on. Enable a Bulk Redirect rule that uses the list.
7. **Web Analytics.** In the project's Metrics, enable Web Analytics.
8. **Check.** From `js/`, run `pnpm --filter @rastrolog/site run verify-live`. Every line should read `ok`.
