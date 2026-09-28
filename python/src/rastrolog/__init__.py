"""Classify AI crawler and AI referral traffic."""

from importlib.metadata import version as _version

from rastrolog.classify import Match, classify_referrer, classify_request, classify_user_agent

__version__ = _version("rastrolog")

__all__ = [
    "Match",
    "__version__",
    "classify_referrer",
    "classify_request",
    "classify_user_agent",
]
