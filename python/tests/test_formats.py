from datetime import datetime, timezone

import pytest
from helpers import SAMPLE_UA

from rastrolog.formats import (
    AlbParser,
    CloudFrontParser,
    CombinedParser,
    LogRecord,
    MalformedLineError,
    UnknownFormatError,
    detect,
    normalize_path,
    parse_clf_time,
)

UTC = timezone.utc
BROWSER = SAMPLE_UA["browser"]
GPTBOT = SAMPLE_UA["gptbot"]

COMBINED_LINE = (
    '203.0.113.9 - - [28/Sep/2026:12:00:00 +0000] "GET /pricing?utm_source=chatgpt.com HTTP/1.1" '
    f'200 512 "https://chatgpt.com/" "{BROWSER}"'
)
ALB_LINE = (
    "https 2026-09-28T12:00:00.186641Z app/my-lb/50dc6c495c0c9188 198.51.100.7:2817 "
    '10.0.0.1:80 0.000 0.001 0.000 200 200 34 366 "GET https://www.example.com:443/docs?a=b HTTP/1.1" '
    f'"{GPTBOT}" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 arn:aws:elasticloadbalancing:x "Root=1-58" '
    '"www.example.com" "arn:aws:acm:x" 0 2026-09-28T12:00:00.000000Z "forward" "-" "-" '
    '"10.0.0.1:80" "200" "-" "-"'
)
CF_FIELDS = (
    "#Fields: date time x-edge-location sc-bytes c-ip cs-method cs(Host) cs-uri-stem "
    "sc-status cs(Referer) cs(User-Agent) cs-uri-query"
)
CF_LINE = "\t".join(
    [
        "2026-09-28",
        "12:00:00",
        "LAX1",
        "392",
        "198.51.100.7",
        "GET",
        "d111111abcdef8.cloudfront.net",
        "/docs",
        "200",
        "https://claude.ai/",
        BROWSER.replace(" ", "%20"),
        "-",
    ]
)


def test_detects_each_format() -> None:
    assert detect(COMBINED_LINE) == "combined"
    assert detect(ALB_LINE) == "alb"
    assert detect("#Version: 1.0") == "cloudfront"
    assert detect(CF_FIELDS) == "cloudfront"
    assert detect(CF_LINE) == "cloudfront"


def test_unknown_format_keeps_the_line() -> None:
    with pytest.raises(UnknownFormatError) as info:
        detect("hello, world")
    assert info.value.line == "hello, world"


def test_combined_parses_all_fields() -> None:
    assert CombinedParser().parse(COMBINED_LINE) == LogRecord(
        ts=datetime(2026, 9, 28, 12, 0, 0, tzinfo=UTC),
        path="/pricing",
        status=200,
        ua=BROWSER,
        referrer="https://chatgpt.com/",
    )


def test_combined_converts_offsets_to_utc() -> None:
    line = COMBINED_LINE.replace("28/Sep/2026:12:00:00 +0000", "28/Sep/2026:07:00:00 -0500")
    record = CombinedParser().parse(line)
    assert record is not None
    assert record.ts == datetime(2026, 9, 28, 12, 0, 0, tzinfo=UTC)


@pytest.mark.parametrize(
    ("month", "number"),
    [
        ("Jan", 1),
        ("Feb", 2),
        ("Mar", 3),
        ("Apr", 4),
        ("May", 5),
        ("Jun", 6),
        ("Jul", 7),
        ("Aug", 8),
        ("Sep", 9),
        ("Oct", 10),
        ("Nov", 11),
        ("Dec", 12),
    ],
)
def test_month_names_do_not_depend_on_locale(month: str, number: int) -> None:
    assert parse_clf_time(f"01/{month}/2026:00:00:00 +0000").month == number


def test_bad_month_is_malformed() -> None:
    with pytest.raises(MalformedLineError):
        parse_clf_time("01/Sept/2026:00:00:00 +0000")


def test_apache_backslash_escaped_quote_in_user_agent() -> None:
    line = COMBINED_LINE.replace(BROWSER, 'Weird \\"quoted\\" agent')
    record = CombinedParser().parse(line)
    assert record is not None
    assert record.ua == 'Weird "quoted" agent'


def test_nginx_hex_escaped_quote_in_user_agent() -> None:
    line = COMBINED_LINE.replace(BROWSER, "Weird \\x22quoted\\x22 agent")
    record = CombinedParser().parse(line)
    assert record is not None
    assert record.ua == 'Weird "quoted" agent'


def test_combined_dash_referrer_is_empty() -> None:
    record = CombinedParser().parse(COMBINED_LINE.replace('"https://chatgpt.com/"', '"-"'))
    assert record is not None
    assert record.referrer == ""


def test_combined_request_without_a_target() -> None:
    line = COMBINED_LINE.replace('"GET /pricing?utm_source=chatgpt.com HTTP/1.1"', '"-"')
    record = CombinedParser().parse(line)
    assert record is not None
    assert record.path == "-"


def test_combined_garbage_is_malformed() -> None:
    with pytest.raises(MalformedLineError):
        CombinedParser().parse("this is not a log line")


def test_alb_reduces_absolute_url_and_has_no_referrer() -> None:
    assert AlbParser().parse(ALB_LINE) == LogRecord(
        ts=datetime(2026, 9, 28, 12, 0, 0, 186641, tzinfo=UTC),
        path="/docs",
        status=200,
        ua=GPTBOT,
        referrer="",
    )


def test_cloudfront_follows_fields_header_and_decodes() -> None:
    parser = CloudFrontParser()
    assert parser.parse("#Version: 1.0") is None
    assert parser.parse(CF_FIELDS) is None
    assert parser.parse(CF_LINE) == LogRecord(
        ts=datetime(2026, 9, 28, 12, 0, 0, tzinfo=UTC),
        path="/docs",
        status=200,
        ua=BROWSER,
        referrer="https://claude.ai/",
    )


def test_cloudfront_reordered_fields() -> None:
    parser = CloudFrontParser()
    parser.parse("#Fields: cs(User-Agent) cs(Referer) sc-status cs-uri-stem time date")
    record = parser.parse("\t".join(["Agent%201", "-", "404", "/x", "01:02:03", "2026-01-02"]))
    assert record == LogRecord(
        ts=datetime(2026, 1, 2, 1, 2, 3, tzinfo=UTC),
        path="/x",
        status=404,
        ua="Agent 1",
        referrer="",
    )


def test_cloudfront_without_header_uses_default_field_order() -> None:
    record = CloudFrontParser().parse(CF_LINE)
    assert record is not None
    assert record.path == "/docs"


def test_cloudfront_short_line_is_malformed() -> None:
    with pytest.raises(MalformedLineError):
        CloudFrontParser().parse("2026-09-28\t12:00:00\tLAX1")


@pytest.mark.parametrize(
    ("target", "expected"),
    [
        ("/a?b=1#c", "/a"),
        ("https://h.example:443/docs?x=1", "/docs"),
        ("https://h.example", "/"),
        ("", "/"),
        ("/", "/"),
    ],
)
def test_normalize_path(target: str, expected: str) -> None:
    assert normalize_path(target) == expected
