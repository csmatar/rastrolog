## Summary

What changed and why. Link the issue: `Closes #…`

## Changes

-

## Testing

Commands you ran and their result:

```bash
cd python
uv run ruff check . && uv run ruff format --check . && uv run mypy
uv run pytest --cov=rastrolog --cov-fail-under=90
```

## Checklist

- [ ] Tests written first and passing; coverage ≥ 90%
- [ ] Core modules stay standard-library only (`rich`/`typer` only in `cli.py`, `render.py`, `theme.py`)
- [ ] No network calls, telemetry or visitor data introduced

### If `signals.json` changed

- [ ] Each entry cites the vendor's docs (or is flagged `"vendor_documented": false` with a third-party source)
- [ ] A fixture was added to `conformance/`
- [ ] `CHANGELOG.md` has a line under **Unreleased → Signals**

### If behaviour covered by `conformance/` changed

- [ ] Fixtures and golden reports updated (`uv run python scripts/write_golden.py`) and the diff reviewed
- [ ] `conformance/README.md` still describes the behaviour

### If a workflow changed

- [ ] Actions pinned to a full commit SHA with a `# vX.Y.Z` comment
- [ ] `uvx zizmor --persona=pedantic .github/` reports no findings
