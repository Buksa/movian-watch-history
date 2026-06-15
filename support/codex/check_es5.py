#!/usr/bin/env python3

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path


PREFIX_KEYWORDS = {
    "case",
    "delete",
    "do",
    "else",
    "in",
    "instanceof",
    "new",
    "return",
    "throw",
    "typeof",
    "void",
}

CHECKS = (
    ("let, const, or class", re.compile(r"\b(?:let|const|class)\b")),
    ("an arrow function", re.compile(r"=>")),
    ("a template literal", re.compile(r"`")),
    ("optional chaining", re.compile(r"\?\.")),
    ("nullish coalescing", re.compile(r"\?\?")),
    ("async or await", re.compile(r"\b(?:async|await)\b")),
    ("spread or rest syntax", re.compile(r"\.\.\.")),
    ("a for-of loop", re.compile(r"\bfor\s*\([^)]*\s+of\s+")),
    (
        "object or array destructuring",
        re.compile(r"\b(?:var|let|const)\s+(?:[A-Za-z_$][\w$]*\s*,\s*)*[\[{]"),
    ),
    (
        "parameter destructuring",
        re.compile(r"\b(?:function|catch)\b[^(]*\(\s*[\[{]"),
    ),
)


def mask_range(source: str, output: list[str], start: int, end: int) -> None:
    output.extend("\n" if char == "\n" else " " for char in source[start:end])


def skip_quoted(source: str, start: int, quote: str) -> int:
    index = start + 1
    while index < len(source):
        if source[index] == "\\":
            index += 2
            continue
        index += 1
        if source[index - 1] == quote:
            break
    return min(index, len(source))


def skip_regex(source: str, start: int) -> int:
    index = start + 1
    in_class = False
    while index < len(source):
        char = source[index]
        if char == "\\":
            index += 2
            continue
        if char == "[":
            in_class = True
        elif char == "]":
            in_class = False
        elif char == "/" and not in_class:
            index += 1
            while index < len(source) and source[index].isalpha():
                index += 1
            break
        elif char == "\n":
            break
        index += 1
    return min(index, len(source))


def sanitized_source(source: str) -> str:
    output: list[str] = []
    index = 0
    regex_allowed = True
    while index < len(source):
        char = source[index]
        next_char = source[index + 1] if index + 1 < len(source) else ""

        if char.isspace():
            output.append(char)
            index += 1
            continue

        if char == "/" and next_char == "/":
            end = source.find("\n", index + 2)
            end = len(source) if end == -1 else end
            mask_range(source, output, index, end)
            index = end
            continue

        if char == "/" and next_char == "*":
            end = source.find("*/", index + 2)
            end = len(source) if end == -1 else end + 2
            mask_range(source, output, index, end)
            index = end
            continue

        if char in {"'", '"'}:
            end = skip_quoted(source, index, char)
            mask_range(source, output, index, end)
            index = end
            regex_allowed = False
            continue

        if char == "`":
            end = skip_quoted(source, index, char)
            output.append("`")
            mask_range(source, output, index + 1, end)
            index = end
            regex_allowed = False
            continue

        if char == "/" and regex_allowed:
            end = skip_regex(source, index)
            mask_range(source, output, index, end)
            index = end
            regex_allowed = False
            continue

        identifier = re.match(r"[A-Za-z_$][\w$]*", source[index:])
        if identifier:
            token = identifier.group(0)
            output.append(token)
            index += len(token)
            regex_allowed = token in PREFIX_KEYWORDS
            continue

        number = re.match(r"(?:\d+(?:\.\d*)?|\.\d+)", source[index:])
        if number:
            token = number.group(0)
            output.append(token)
            index += len(token)
            regex_allowed = False
            continue

        output.append(char)
        index += 1
        if char in ")]}":
            regex_allowed = False
        elif char == ".":
            regex_allowed = False
        else:
            regex_allowed = True

    return "".join(output)


def tracked_javascript() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "-z", "--", "*.js"],
        check=True,
        capture_output=True,
    )
    return [
        Path(value.decode("utf-8"))
        for value in result.stdout.split(b"\0")
        if value
    ]


def check_file(path: Path) -> int:
    source = path.read_text(encoding="utf-8")
    sanitized = sanitized_source(source)
    failures = 0
    for label, pattern in CHECKS:
        for match in pattern.finditer(sanitized):
            line = sanitized.count("\n", 0, match.start()) + 1
            print(f"ERROR: {path}:{line}: {label}", file=sys.stderr)
            failures += 1
    return failures


def main() -> int:
    paths = [Path(value) for value in sys.argv[1:]] or tracked_javascript()
    failures = sum(check_file(path) for path in paths)
    if failures:
        return 1
    print("Tracked JavaScript passes the ES5.1 compatibility scan")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
