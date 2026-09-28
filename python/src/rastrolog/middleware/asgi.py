"""ASGI middleware for FastAPI, Starlette and any ASGI app. Standard library only.

    from rastrolog.middleware.asgi import AITrafficMiddleware
    app.add_middleware(AITrafficMiddleware, on_match=my_counter, log=True)

In a handler, ``request.state.ai_traffic`` is a ``rastrolog.Match`` or ``None``.
No storage, no counters, no network: push into your own metrics via ``on_match``.
"""

from __future__ import annotations

import inspect
import logging
from collections.abc import Awaitable, Callable, MutableMapping
from typing import Any

from rastrolog.classify import Match, classify_request

Scope = MutableMapping[str, Any]
Message = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]
ASGIApp = Callable[[Scope, Receive, Send], Awaitable[None]]
OnMatch = Callable[[Match, Scope], Any]

logger = logging.getLogger("rastrolog")


class AITrafficMiddleware:
    """Tag each HTTP request with ``scope["state"]["ai_traffic"]``.

    Crawler matches (User-Agent) take precedence over referral matches (Referer).
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        on_match: OnMatch | None = None,
        log: bool = False,
        own_host: str | None = None,
    ) -> None:
        self.app = app
        self.on_match = on_match
        self.log = log
        self.own_host = own_host

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            user_agent, referrer = _headers(scope)
            match = classify_request(user_agent, referrer, own_host=self.own_host)
            scope.setdefault("state", {})["ai_traffic"] = match
            if match is not None:
                await self._matched(match, scope)
        await self.app(scope, receive, send)

    async def _matched(self, match: Match, scope: Scope) -> None:
        if self.log:
            logger.info(
                "ai_traffic kind=%s id=%s path=%s",
                match.kind,
                match.id,
                scope.get("path", ""),
                extra={"ai_traffic": match.to_dict()},
            )
        if self.on_match is None:
            return
        try:
            result = self.on_match(match, scope)
            if inspect.isawaitable(result):
                await result
        except Exception:
            logger.warning("rastrolog on_match callback failed", exc_info=True)


def _headers(scope: Scope) -> tuple[str | None, str | None]:
    user_agent: str | None = None
    referrer: str | None = None
    for name, value in scope.get("headers", ()):
        if name == b"user-agent":
            user_agent = value.decode("latin-1")
        elif name == b"referer":
            referrer = value.decode("latin-1")
    return user_agent, referrer
