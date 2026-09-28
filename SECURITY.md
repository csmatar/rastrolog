# Security Policy

## Supported versions

rastrolog follows the latest release on [PyPI](https://pypi.org/project/rastrolog/).
Security fixes land on the newest minor version; please upgrade before reporting.

| Version | Supported |
| ------- | --------- |
| latest `0.1.x` | ✅ |
| older | ❌ (please upgrade) |

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report privately through GitHub's
**[Private Vulnerability Reporting](https://github.com/csmatar/rastrolog/security/advisories/new)**
(Security → Advisories → *Report a vulnerability*). The report stays confidential until a
fix is released.

Please include:

- A description of the issue and its impact.
- Steps to reproduce: ideally a few log lines, a user-agent/referrer string, or a minimal
  ASGI/Django setup.
- The version (`rastrolog --version`) and your OS / Python version.

## What to expect

- An acknowledgement within a few days.
- A fix and a coordinated disclosure timeline agreed with you.
- Credit in the advisory once it's published, if you'd like it.

## Scope

rastrolog is a classifier and a checker: **it hosts nothing, stores nothing and makes no
network calls.** The classes of issue that matter most:

- **Untrusted log input:** crashes, hangs or pathological slowdowns (e.g. regex
  backtracking) from crafted log lines, gzip streams or huge files.
- **Terminal injection:** log-derived text (paths, user agents, referrers, file names)
  being interpreted as markup or control sequences when rendered by the CLI.
- **Middleware in production:** memory growth or crashes caused by attacker-supplied
  `User-Agent` / `Referer` headers; any way the middleware could break a request.
- **Privacy guarantee:** any code path that sends data over the network, stores visitor
  data, or identifies a visitor (the project classifies the *source* of a visit, never the
  person).
- **Supply chain:** the release pipeline (`.github/workflows/release.yml`), PyPI Trusted
  Publishing, and the bundled `signals.json`.

Misclassifications (a bot missing from the list, a wrong purpose) are not security issues;
please open a regular issue or a pull request for those.

Thanks for helping keep rastrolog and its users safe.
