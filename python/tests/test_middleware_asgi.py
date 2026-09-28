import asyncio
import json
import logging
from collections.abc import MutableMapping
from typing import Any

import pytest
from helpers import SAMPLE_UA
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from rastrolog import Match
from rastrolog.middleware.asgi import AITrafficMiddleware

Scope = MutableMapping[str, Any]


def _scope(headers: dict[str, str], path: str = "/") -> Scope:
    return {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "root_path": "",
        "headers": [(k.lower().encode("latin-1"), v.encode("latin-1")) for k, v in headers.items()],
        "client": ("127.0.0.1", 50000),
        "server": ("testserver", 80),
    }


def _call(app: Any, scope: Scope) -> list[dict[str, Any]]:
    sent: list[dict[str, Any]] = []

    async def receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: dict[str, Any]) -> None:
        sent.append(message)

    asyncio.run(app(scope, receive, send))
    return sent


def _capture() -> tuple[Any, dict[str, Any]]:
    seen: dict[str, Any] = {}

    async def inner(scope: Scope, receive: Any, send: Any) -> None:
        seen["match"] = scope["state"]["ai_traffic"]

    return inner, seen


def test_tags_crawler() -> None:
    inner, seen = _capture()
    _call(AITrafficMiddleware(inner), _scope({"User-Agent": SAMPLE_UA["gptbot"]}))
    assert seen["match"].id == "openai-gptbot"


def test_tags_referral() -> None:
    inner, seen = _capture()
    headers = {"User-Agent": SAMPLE_UA["browser"], "Referer": "https://claude.ai/"}
    _call(AITrafficMiddleware(inner), _scope(headers))
    assert seen["match"].id == "claude"


def test_plain_visit_is_none() -> None:
    inner, seen = _capture()
    _call(AITrafficMiddleware(inner), _scope({"User-Agent": SAMPLE_UA["browser"]}))
    assert seen["match"] is None


def test_non_http_scopes_pass_through_untouched() -> None:
    seen: dict[str, Any] = {}

    async def inner(scope: Scope, receive: Any, send: Any) -> None:
        seen["scope"] = scope

    asyncio.run(AITrafficMiddleware(inner)({"type": "lifespan"}, None, None))  # type: ignore[arg-type]
    assert "state" not in seen["scope"]


def test_on_match_sync_and_async() -> None:
    calls: list[str] = []

    async def async_hook(match: Match, scope: Scope) -> None:
        calls.append("async:" + match.id)

    inner, _ = _capture()
    scope = {"User-Agent": SAMPLE_UA["claudebot"]}
    _call(
        AITrafficMiddleware(inner, on_match=lambda m, s: calls.append("sync:" + m.id)),
        _scope(scope),
    )
    _call(AITrafficMiddleware(inner, on_match=async_hook), _scope(scope))
    assert calls == ["sync:anthropic-claudebot", "async:anthropic-claudebot"]


def test_failing_callback_does_not_break_the_request(caplog: pytest.LogCaptureFixture) -> None:
    def boom(match: Match, scope: Scope) -> None:
        raise RuntimeError("metrics backend down")

    inner, seen = _capture()
    with caplog.at_level(logging.WARNING, logger="rastrolog"):
        _call(
            AITrafficMiddleware(inner, on_match=boom), _scope({"User-Agent": SAMPLE_UA["gptbot"]})
        )
    assert seen["match"].id == "openai-gptbot"
    assert "on_match callback failed" in caplog.text


def test_log_line(caplog: pytest.LogCaptureFixture) -> None:
    inner, _ = _capture()
    with caplog.at_level(logging.INFO, logger="rastrolog"):
        _call(
            AITrafficMiddleware(inner, log=True),
            _scope({"User-Agent": SAMPLE_UA["gptbot"]}, "/docs"),
        )
    assert "kind=crawler id=openai-gptbot path=/docs" in caplog.text


def test_own_host() -> None:
    inner, seen = _capture()
    headers = {"User-Agent": SAMPLE_UA["browser"], "Referer": "https://chatgpt.com/"}
    _call(AITrafficMiddleware(inner, own_host="chatgpt.com"), _scope(headers))
    assert seen["match"] is None


def test_starlette_request_state_integration() -> None:
    async def home(request: Request) -> JSONResponse:
        match = request.state.ai_traffic
        return JSONResponse({"id": match.id if match else None})

    app = Starlette(routes=[Route("/", home)])
    app.add_middleware(AITrafficMiddleware)
    sent = _call(app, _scope({"User-Agent": SAMPLE_UA["perplexitybot"]}))
    body = b"".join(m.get("body", b"") for m in sent if m["type"] == "http.response.body")
    assert json.loads(body) == {"id": "perplexity-perplexitybot"}
