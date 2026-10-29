#!/usr/bin/env python3
"""Write script-tag globals next to the split JSON, for file:// opens.

HTTP keeps using the JSON files. A local file open cannot fetch, so each
catalog file also has a .js sibling that assigns a window global.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
BOOKS = DATA / "books"


def js_json(value):
    text = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return text.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")


def write(path, source):
    path.write_text(source, encoding="utf-8", newline="\n")


def main():
    home = json.loads((DATA / "home.json").read_text(encoding="utf-8"))
    categories = json.loads((DATA / "categories.json").read_text(encoding="utf-8"))
    write(DATA / "home.js", "window.EBOOK_HOME=" + js_json(home) + ";\n")
    write(DATA / "categories.js", "window.EBOOK_CATEGORIES=" + js_json(categories) + ";\n")
    count = 0
    for path in sorted(BOOKS.glob("*.json")):
        rows = json.loads(path.read_text(encoding="utf-8"))
        name = path.stem
        body = (
            "window.EBOOK_SHARDS=window.EBOOK_SHARDS||{};"
            "window.EBOOK_SHARDS[" + js_json(name) + "]=" + js_json(rows) + ";\n"
        )
        write(path.with_suffix(".js"), body)
        count += 1
    print("js_globals", 2 + count)


if __name__ == "__main__":
    main()
