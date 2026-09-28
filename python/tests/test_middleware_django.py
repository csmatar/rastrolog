import asyncio
import logging
from typing import Any

import pytest

django = pytest.importorskip("django")

from django.conf import settings  # noqa: E402

if not settings.configured:
    settings.configure(SECRET_KEY="rastrolog-tests", ALLOWED_HOSTS=["testserver"], USE_TZ=True)
    django.setup()

from django.http import HttpResponse  # noqa: E402
from django.test import RequestFactory, override_settings  # noqa: E402
from helpers import SAMPLE_UA  # noqa: E402

from rastrolog import Match  # noqa: E402
from rastrolog.middleware.django import AITrafficMiddleware  # noqa: E402

factory = RequestFactory()
CALLS: list[tuple[str, str]] = []


def record_call(match: Match, request: Any) -> None:
    CALLS.append((match.id, request.path))


def ok(request: Any) -> HttpResponse:
    return HttpResponse("ok")


async def async_ok(request: Any) -> HttpResponse:
    return HttpResponse("ok")


def test_declares_sync_and_async_support() -> None:
    assert AITrafficMiddleware.sync_capable is True
    assert AITrafficMiddleware.async_capable is True


def test_sync_request_is_tagged() -> None:
    request = factory.get("/", HTTP_USER_AGENT=SAMPLE_UA["claudebot"])
    response = AITrafficMiddleware(ok)(request)
    assert response.status_code == 200
    assert request.ai_traffic.id == "anthropic-claudebot"


def test_async_request_is_tagged() -> None:
    request = factory.get(
        "/", HTTP_USER_AGENT=SAMPLE_UA["browser"], HTTP_REFERER="https://chatgpt.com/"
    )
    asyncio.run(AITrafficMiddleware(async_ok)(request))
    assert request.ai_traffic.id == "chatgpt"


def test_plain_visit_is_none() -> None:
    request = factory.get("/", HTTP_USER_AGENT=SAMPLE_UA["browser"])
    AITrafficMiddleware(ok)(request)
    assert request.ai_traffic is None


def test_on_match_from_dotted_path() -> None:
    CALLS.clear()
    with override_settings(RASTROLOG={"on_match": "test_middleware_django.record_call"}):
        middleware = AITrafficMiddleware(ok)
    middleware(factory.get("/docs", HTTP_USER_AGENT=SAMPLE_UA["gptbot"]))
    assert CALLS == [("openai-gptbot", "/docs")]


def test_async_on_match_is_awaited() -> None:
    calls: list[str] = []

    async def hook(match: Match, request: Any) -> None:
        calls.append(match.id)

    with override_settings(RASTROLOG={"on_match": hook}):
        middleware = AITrafficMiddleware(async_ok)
    asyncio.run(middleware(factory.get("/", HTTP_USER_AGENT=SAMPLE_UA["gptbot"])))
    assert calls == ["openai-gptbot"]


def test_failing_callback_is_logged_not_raised(caplog: pytest.LogCaptureFixture) -> None:
    def boom(match: Match, request: Any) -> None:
        raise RuntimeError("down")

    with override_settings(RASTROLOG={"on_match": boom}):
        middleware = AITrafficMiddleware(ok)
    with caplog.at_level(logging.WARNING, logger="rastrolog"):
        response = middleware(factory.get("/", HTTP_USER_AGENT=SAMPLE_UA["gptbot"]))
    assert response.status_code == 200
    assert "on_match callback failed" in caplog.text


def test_log_and_own_host(caplog: pytest.LogCaptureFixture) -> None:
    with override_settings(RASTROLOG={"log": True, "own_host": "chatgpt.com"}):
        middleware = AITrafficMiddleware(ok)
    own = factory.get(
        "/", HTTP_USER_AGENT=SAMPLE_UA["browser"], HTTP_REFERER="https://chatgpt.com/"
    )
    with caplog.at_level(logging.INFO, logger="rastrolog"):
        middleware(own)
        middleware(factory.get("/p", HTTP_USER_AGENT=SAMPLE_UA["gptbot"]))
    assert own.ai_traffic is None
    assert "kind=crawler id=openai-gptbot path=/p" in caplog.text
