"""Django middleware: sets ``request.ai_traffic`` to a ``rastrolog.Match`` or ``None``.

    MIDDLEWARE = [..., "rastrolog.middleware.django.AITrafficMiddleware"]

Optional settings::

    RASTROLOG = {
        "on_match": "myproject.metrics.count_ai_traffic",  # callable or dotted path: (match, request)
        "log": True,                                        # INFO line on the "rastrolog" logger
        "own_host": "example.com",                          # ignore self-referrals
    }
"""

from __future__ import annotations

import inspect
import logging
from collections.abc import Callable
from typing import Any

from asgiref.sync import iscoroutinefunction, markcoroutinefunction
from django.conf import settings
from django.http import HttpRequest
from django.utils.module_loading import import_string

from rastrolog.classify import Match, classify_request

logger = logging.getLogger("rastrolog")


class AITrafficMiddleware:
    sync_capable = True
    async_capable = True

    def __init__(self, get_response: Callable[[HttpRequest], Any]) -> None:
        self.get_response = get_response
        config: dict[str, Any] = dict(getattr(settings, "RASTROLOG", {}))
        on_match = config.get("on_match")
        self.on_match: Callable[[Match, HttpRequest], Any] | None = (
            import_string(on_match) if isinstance(on_match, str) else on_match
        )
        self.log = bool(config.get("log", False))
        self.own_host: str | None = config.get("own_host")
        self._async = iscoroutinefunction(get_response)
        if self._async:
            markcoroutinefunction(self)

    def __call__(self, request: HttpRequest) -> Any:
        if self._async:
            return self.__acall__(request)
        match = self._tag(request)
        if match is not None:
            self._run_callback(match, request)
        return self.get_response(request)

    async def __acall__(self, request: HttpRequest) -> Any:
        match = self._tag(request)
        if match is not None:
            result = self._run_callback(match, request)
            if inspect.isawaitable(result):
                try:
                    await result
                except Exception:
                    logger.warning("rastrolog on_match callback failed", exc_info=True)
        return await self.get_response(request)

    def _tag(self, request: HttpRequest) -> Match | None:
        match = classify_request(
            request.headers.get("User-Agent"),
            request.headers.get("Referer"),
            own_host=self.own_host,
        )
        request.ai_traffic = match
        if match is not None and self.log:
            logger.info(
                "ai_traffic kind=%s id=%s path=%s",
                match.kind,
                match.id,
                request.path,
                extra={"ai_traffic": match.to_dict()},
            )
        return match

    def _run_callback(self, match: Match, request: HttpRequest) -> Any:
        if self.on_match is None:
            return None
        try:
            return self.on_match(match, request)
        except Exception:
            logger.warning("rastrolog on_match callback failed", exc_info=True)
            return None
