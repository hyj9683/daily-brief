#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘의 경제 — 사진 수급 도구

위키미디어 공용(Wikimedia Commons)에서 주제에 맞는 사진을 찾아 내려받고,
photos/index.json 에 라이선스·저작자와 함께 등록합니다.
공용은 API 키가 필요 없고 모든 파일이 자유 라이선스라 재배포가 가능합니다.

  # 후보만 훑어보기 (내려받지 않음)
  python tools/fetch-photo.py --search "shipyard crane" --list

  # 골라서 등록 (기본은 1번 후보)
  python tools/fetch-photo.py --id shipyard --search "shipyard gantry crane" \
      --alt "조선소의 골리앗 크레인" --keywords 조선 조선업 수주 선박 HD현대 한화오션

  # 마음에 안 들면 다른 후보로
  python tools/fetch-photo.py --id shipyard --search "..." --pick 3 ...

내려받은 사진은 가로 900px JPEG 로 줄여 저장합니다 (보통 60~90KB).
"""

import argparse
import io
import json
import pathlib
import re
import sys
import urllib.parse
import urllib.request

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
PHOTOS = ROOT / "photos"
INDEX = PHOTOS / "index.json"
API = "https://commons.wikimedia.org/w/api.php"
UA = "daily-brief/1.0 (personal news briefing app; contact via github.com/hyj9683/daily-brief)"

TARGET_WIDTH = 900
JPEG_QUALITY = 82


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def api(params: dict) -> dict:
    return json.loads(get(API + "?" + urllib.parse.urlencode(params)))


def strip_html(s: str) -> str:
    s = re.sub(r"<[^>]+>", "", s or "")
    return re.sub(r"\s+", " ", s).strip()


def search(query: str, limit: int = 12, loose: bool = False) -> list:
    """가로가 긴 사진 위주로 후보를 모은다. loose=True 면 크기·비율 조건을 푼다."""
    min_w, min_h = (500, 350) if loose else (800, 500)
    lo, hi = (1.0, 3.0) if loose else (1.2, 2.2)
    r = api({
        "action": "query", "format": "json", "generator": "search",
        "gsrsearch": f"filetype:bitmap {query}", "gsrnamespace": "6",
        "gsrlimit": str(limit * 3),
        "prop": "imageinfo", "iiprop": "url|size|extmetadata|mime",
        "iiurlwidth": str(TARGET_WIDTH * 2),
    })
    pages = (r.get("query") or {}).get("pages", {})
    out = []
    for p in pages.values():
        info = (p.get("imageinfo") or [None])[0]
        if not info:
            continue
        w, h = info.get("width", 0), info.get("height", 0)
        if info.get("mime") not in ("image/jpeg", "image/png"):
            continue
        if w < min_w or h < min_h:
            continue
        ratio = w / h if h else 0
        if not (lo <= ratio <= hi):        # 신문 사진에 쓸 만한 가로 비율만
            continue
        em = info.get("extmetadata", {})
        lic = strip_html(em.get("LicenseShortName", {}).get("value", ""))
        if "Fair use" in lic or "Non-free" in lic:
            continue
        out.append({
            "title": p["title"],
            "width": w, "height": h, "ratio": round(ratio, 2),
            "license": lic or "?",
            "author": strip_html(em.get("Artist", {}).get("value", "")) or "미상",
            "desc": strip_html(em.get("ImageDescription", {}).get("value", ""))[:110],
            "thumb": info.get("thumburl") or info.get("url"),
            "page": info.get("descriptionurl", ""),
        })
        if len(out) >= limit:
            break
    # 공용 검색은 자유 라이선스가 확실한 옛 기록사진을 위로 올리는 경향이 있다.
    # 경제 브리핑에는 현대 사진이 필요하므로 옛 자료 냄새가 나는 후보를 뒤로 민다.
    ARCHIVAL = re.compile(
        r"\b(18|19[0-8])\d\d\b|history of|archive|vintage|postcard|engraving|"
        r"lithograph|black.and.white|collection of|library of congress|"
        r"national archives|glass negative",
        re.I,
    )

    ARCHIVAL_SOURCE = re.compile(
        r"rijksmuseum|internet archive|library of congress|national archives|"
        r"nationaal archief|bundesarchiv|museum|gallery of art|state library|"
        r"public library|historical society|smithsonian",
        re.I,
    )

    def score(c):
        s = abs(c["ratio"] - 1.5)                      # 3:2 에 가까울수록 좋다
        blob = f"{c['title']} {c['desc']}"
        if ARCHIVAL_SOURCE.search(c["author"]):
            s += 10                                    # 박물관·기록보관소 소장품은 옛 자료다
        if ARCHIVAL.search(blob):
            s += 10                                    # 옛 자료는 강하게 뒤로
        if c["width"] < 1200:
            s += 0.5
        return s

    out.sort(key=score)
    return out


def save_photo(cand: dict, photo_id: str) -> pathlib.Path:
    im = Image.open(io.BytesIO(get(cand["thumb"])))
    if im.mode not in ("RGB", "L"):
        im = im.convert("RGB")
    if im.width > TARGET_WIDTH:
        im = im.resize((TARGET_WIDTH, round(im.height * TARGET_WIDTH / im.width)), Image.LANCZOS)
    PHOTOS.mkdir(exist_ok=True)
    path = PHOTOS / f"{photo_id}.jpg"
    im.save(path, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
    return path


def load_index() -> dict:
    if INDEX.exists():
        return json.loads(INDEX.read_text(encoding="utf-8"))
    return {"note": "주제별 사진 라이브러리. keywords 로 그날 기사에 맞는 사진을 고른다.", "photos": []}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--search", required=True, help="위키미디어 공용 검색어 (영어가 잘 나옴)")
    ap.add_argument("--id", help="사진 id — photos/<id>.jpg 로 저장된다")
    ap.add_argument("--alt", default="", help="대체 텍스트 (한국어)")
    ap.add_argument("--keywords", nargs="*", default=[], help="이 사진을 고를 때 쓸 한국어 키워드")
    ap.add_argument("--pick", type=int, default=1, help="몇 번째 후보를 쓸지 (기본 1)")
    ap.add_argument("--list", action="store_true", help="내려받지 않고 후보만 출력")
    a = ap.parse_args()

    cands = search(a.search)
    if not cands:
        cands = search(a.search, loose=True)
        if cands:
            print("(조건을 풀어 다시 찾았습니다)", file=sys.stderr)
    if not cands:
        print(f"후보를 찾지 못했습니다: {a.search}", file=sys.stderr)
        return 1

    if a.list or not a.id:
        for i, c in enumerate(cands, 1):
            print(f"[{i}] {c['width']}x{c['height']} ({c['ratio']})  {c['license']}")
            print(f"    {c['title'][5:80]}")
            if c["desc"]:
                print(f"    {c['desc']}")
        return 0

    if not 1 <= a.pick <= len(cands):
        print(f"--pick 은 1~{len(cands)} 사이여야 합니다.", file=sys.stderr)
        return 1

    c = cands[a.pick - 1]
    path = save_photo(c, a.id)
    kb = path.stat().st_size / 1024

    idx = load_index()
    entry = {
        "id": a.id,
        "file": f"photos/{path.name}",
        "alt": a.alt or strip_html(c["desc"])[:60] or a.id,
        "keywords": a.keywords,
        "credit": f"{c['author']} / Wikimedia Commons · {c['license']}",
        "source": c["page"],
    }
    idx["photos"] = [p for p in idx["photos"] if p.get("id") != a.id] + [entry]
    idx["photos"].sort(key=lambda p: p["id"])
    INDEX.write_text(json.dumps(idx, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"저장 {path.name}  {kb:.0f} KB")
    print(f"  라이선스 {c['license']}")
    print(f"  저작자   {c['author'][:60]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
