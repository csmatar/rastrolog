# rastrolog

[![CI](https://github.com/csmatar/rastrolog/actions/workflows/ci.yml/badge.svg)](https://github.com/csmatar/rastrolog/actions/workflows/ci.yml)
[![PyPI](https://img.shields.io/pypi/v/rastrolog)](https://pypi.org/project/rastrolog/)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/csmatar/rastrolog/badge)](https://scorecard.dev/viewer/?uri=github.com/csmatar/rastrolog)

**See which AI crawlers read your site and which AI chat products send you visitors.**

![rastrolog parse and rastrolog check in a terminal](docs/demo.gif)

`rastrolog` reads your access logs and prints two tables:

1. **AI crawlers** by user agent (GPTBot, ClaudeBot, PerplexityBot, …): what they fetched, and whether each one is there to train, to fetch a page for a user, or to build a search index.
2. **AI referrals**: people who clicked a link inside ChatGPT, Claude, Perplexity, Gemini or Copilot, and the pages they landed on.

It classifies where a visit came from, never who the visitor is. There is no hosting, no storage and no telemetry.

## Install

```bash
pip install rastrolog        # or: uv tool install rastrolog
```

## Use

```bash
rastrolog parse access.log                     # nginx, Apache combined, CloudFront, ALB; .gz is fine
rastrolog parse access.log.gz --since 7d --json
rastrolog parse access.log --by page --top 20  # which pages AI tools touch
rastrolog check "https://chatgpt.com/"         # classify one referrer or user agent
```

`--json` writes the same report as JSON on stdout, for piping into anything else.

## In your app

FastAPI / Starlette:

```python
from rastrolog.middleware.asgi import AITrafficMiddleware

app.add_middleware(
    AITrafficMiddleware, on_match=lambda match, scope: counter.labels(match.id).inc()
)
# in a handler: request.state.ai_traffic -> rastrolog.Match | None
```

Django:

```python
MIDDLEWARE = [..., "rastrolog.middleware.django.AITrafficMiddleware"]
RASTROLOG = {"on_match": "myproject.metrics.count_ai_traffic", "log": True}
# in a view: request.ai_traffic -> rastrolog.Match | None
```

Library:

```python
from rastrolog import classify_user_agent, classify_referrer

classify_user_agent("Mozilla/5.0 ... GPTBot/1.3 ...")
# Match(kind='crawler', id='openai-gptbot', vendor='openai', token='GPTBot', purpose='training', ...)
classify_referrer("https://www.google.com/")  # None
```

## What it detects

The lists live in [`signals.json`](signals.json). Crawler tokens cite the vendor's own documentation, except Bytespider (ByteDance publishes none, so that entry is flagged `vendor_documented: false` and sourced from a reputable third party instead). Referrer hosts cite either vendor docs or a published AI-source list from an analytics vendor (Matomo, Plausible). robots.txt-only tokens (`Google-Extended`, `Applebot-Extended`) never appear in a user agent string; they're read by the robots.txt checker, not by log classification. Every user-agent crawler and every referrer has a fixture in [`conformance/`](conformance/); robots.txt-only tokens are exercised by the robots.txt checker instead.

Known gaps, stated plainly:

- **Google AI Overviews and AI Mode** send visitors with a plain `google.com` referrer, which can't be told apart from ordinary search. rastrolog doesn't guess.
- **AWS ALB logs** have no Referer field, so ALB logs show crawlers only.
- Some AI apps strip the referrer entirely. Those visits look like direct traffic.

## Get notified when the list changes

New AI crawlers appear every few months, and your robots.txt goes out of date the day they do. Until the email signup page launches, watch this repo's releases (**Watch → Custom → Releases**). Every release that changes `signals.json` says what was added.

## Contributing a new bot or referrer

1. Add the entry to `signals.json`, with a `docs_url` pointing to the vendor's own page. If the vendor publishes nothing, a reputable third-party source is accepted, but the entry must also carry `"vendor_documented": false`.
2. Add at least one real user-agent string (or referrer URL) to `conformance/`.
3. Add a line under **Unreleased → Signals** in `CHANGELOG.md`.

CI fails if step 2 is missing. That rule is what keeps the list trustworthy.

## Scope

This is a classifier and a checker, kept small on purpose. Use the callback and the JSON output to build what you need on top.

MIT © Carlos Saldaña Matar
