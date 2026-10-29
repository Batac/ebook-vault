#!/usr/bin/env python3
"""Rebuild the split demo catalog from a local export.

The export path below is a generator input only. It is not shipped with the
demo, and the page never requests it. HTTP loads the JSON files under data/.
Opening index.html as a local file loads the matching .js globals.
"""

import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "all-books.json"
DATA = ROOT / "data"
BOOKS = DATA / "books"

LITERATURE_CATS = {
    "文学阅读",
    "中国古典文学",
    "中国现当代文学",
    "外国文学",
    "诗歌散文",
}
SCIENCE_CATS = {"科技科普", "综合百科", "人文社科"}
LITERATURE_PINS = [
    "红楼梦",
    "西游记",
    "水浒传",
    "三国演义",
    "楚辞",
    "论语",
    "孟子",
    "老子",
    "唐诗三百首",
    "宋词三百首",
    "古文观止",
    "野草",
    "朝花夕拾",
    "聊斋志异",
    "儒林外史",
    "西厢记",
    "牡丹亭",
    "围城",
]
SCIENCE_PINS = [
    "别逗了，费曼先生",
    "人类简史：从动物到上帝",
    "上帝掷骰子吗？量子物理史话",
    "给忙碌者的天体物理学",
    "寂静的春天（四师推荐精装版）",
    "基因传",
    "生命是什么：活细胞的物理观",
    "数学之美",
    "枪炮、病菌与钢铁 : 人类社会的命运 (世纪人文系列丛书·开放人文)",
    "天演论",
    "几何原本",
    "梦溪笔谈",
    "天工开物",
    "病毒星球",
    "细胞生命的礼赞",
    "未来简史",
    "浪潮之巅",
    "十问：霍金沉思录",
]
CJK = re.compile(r"[\u4e00-\u9fff]")


def pin_tables():
    rank = {}
    kind = {}
    slots = max(len(LITERATURE_PINS), len(SCIENCE_PINS))
    pin_rank = 1
    for slot in range(slots):
        if slot < len(LITERATURE_PINS):
            rank[LITERATURE_PINS[slot]] = pin_rank
            kind[LITERATURE_PINS[slot]] = "lit"
            pin_rank += 1
        if slot < len(SCIENCE_PINS):
            rank[SCIENCE_PINS[slot]] = pin_rank
            kind[SCIENCE_PINS[slot]] = "sci"
            pin_rank += 1
    return rank, kind


def language_of(row):
    code = str(row.get("language") or "").upper()
    if code in ("ZH", "中文"):
        return "ZH"
    if code in ("EN", "英文"):
        return "EN"
    if code in ("OTHER", "其他"):
        return "OTHER"
    if (row.get("category") or "") == "精选论文":
        return "EN"
    title = str(row.get("title") or "")
    if len(CJK.findall(title)) >= 2:
        return "ZH"
    return "EN"


def pin_key(row, rank, kind):
    if not row.get("link"):
        return None
    if language_of(row) != "ZH":
        return None
    title = str(row.get("title") or "").strip()
    title_zh = str(row.get("title_zh") or "").strip()
    key = title if title in rank else ""
    if not key and title_zh and title_zh in rank:
        key = title_zh
    if not key:
        return None
    cat = row.get("category") or "未分类"
    if kind[key] == "lit" and cat not in LITERATURE_CATS:
        return None
    if kind[key] == "sci" and cat not in SCIENCE_CATS:
        return None
    return key


def dump(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")


def main():
    if not SOURCE.is_file():
        print("skip: catalog source not found:", SOURCE)
        print("Input is all-books.json next to this demo. This script does not create that file.")
        return
    rank, kind = pin_tables()
    with SOURCE.open(encoding="utf-8") as handle:
        books = json.load(handle)
    if not isinstance(books, list):
        raise SystemExit("catalog source is not a list")

    groups = defaultdict(list)
    pinned = {}
    seen = {}
    title_hits = defaultdict(list)

    for index, row in enumerate(books):
        if not isinstance(row, dict):
            raise SystemExit("catalog row %s is not an object" % index)
        category = row.get("category") or "未分类"
        if "/" in category or "\\" in category or "\0" in category:
            raise SystemExit("category cannot be a file name: %r" % category)
        tagged = dict(row)
        tagged["id"] = index
        groups[category].append(tagged)
        title = str(row.get("title") or "").strip()
        title_zh = str(row.get("title_zh") or "").strip()
        if title:
            title_hits[title].append(row)
        if title_zh and title_zh != title:
            title_hits[title_zh].append(row)
        key = pin_key(row, rank, kind)
        if not key or seen.get(key):
            continue
        seen[key] = True
        pinned[key] = tagged

    ordered_pins = sorted(rank, key=rank.get)
    home = []
    missing = []
    skipped = []
    for title in ordered_pins:
        if title in pinned:
            home.append(pinned[title])
            continue
        if title not in title_hits:
            missing.append(title)
            continue
        skipped.append(title)

    categories = [
        {"name": name, "count": len(rows)}
        for name, rows in sorted(groups.items(), key=lambda item: (-len(item[1]), item[0]))
    ]
    dump(DATA / "home.json", home)
    dump(DATA / "categories.json", {"total": len(books), "categories": categories})
    for name, rows in groups.items():
        dump(BOOKS / (name + ".json"), rows)

    print("records", len(books))
    print("categories", len(categories))
    print("category_sum", sum(item["count"] for item in categories))
    print("home", len(home))
    print("shards", len(list(BOOKS.glob("*.json"))))
    print("MISSING")
    for title in missing:
        print(title)
    print("SKIPPED")
    for title in skipped:
        print(title)
    print("HOME_ORDER")
    for row in home:
        print("%s\t%s\t%s" % (row["id"], row.get("category") or "", row.get("title") or ""))


if __name__ == "__main__":
    main()
