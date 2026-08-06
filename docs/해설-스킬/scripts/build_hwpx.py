#!/usr/bin/env python3
"""해설 원고(txt) → 한글 해설 파일(hwpx) 변환기.

사용법:
    python3 build_hwpx.py 원고.txt 출력.hwpx [--template 해설-템플릿.hwpx]

원고 형식:
    제목: 2027학년도 대학수학능력시험 대비 모의고사 제5회

    [공통과목]
    01. [ 글의 구조와 전개 방식 ]
    정답 해설 : ① 본문 …
    오답 해설
    ② …
    ③ …

    02. [ 세부 내용 파악 ] (3점)
    …

    [화법과 작문]        ← 선택과목이 없으면 통째로 생략한다
    35. [ … ]
    …

규칙
  · 문항 번호는 두 자리로 맞춘다(01, 02 … 35).
  · 배점 3점 문항만 제목 줄 끝에 (3점) 을 붙인다. 나머지는 2점으로 본다.
    이 표시는 정답표의 배점 칸으로만 들어가고, 본문 유형 라벨에는 찍히지 않는다.
  · 정답 해설 줄은 반드시 '정답 해설 : ⑤ ' 로 시작한다(원문자가 정답).
  · 오답 해설은 원문자로 시작하는 줄 하나가 선지 하나다. 이어지는 줄은 앞 선지에 붙는다.
  · 유형 라벨 바로 아래의 '* …' 한 줄은 문항 총평이다.
  · '→ …' 줄은 바로 앞 해설(정답 해설 또는 그 선지)에 딸린 보충 코멘트로, 별도 문단이 된다.
"""

import argparse
import re
import sys
import zipfile
from pathlib import Path

SECTION = "Contents/section0.xml"
TEMPLATE_NAME = "해설-템플릿.hwpx"
CIRCLED = "①②③④⑤"
ARROWS = "→➔⇨"          # 원고에서 허용하는 보충 코멘트 머리표
ARROW = "→"             # 문서에는 이걸로 통일해 찍는다
SECTION_NAMES = ["공통과목", "화법과 작문", "언어와 매체"]


# ── 원고 파싱 ────────────────────────────────────────────────────────────
def parse(text):
    title = ""
    sections = {}          # 이름 → [문항]
    cur_name, cur_item, mode = None, None, None

    def flush():
        if cur_name and cur_item:
            sections.setdefault(cur_name, []).append(cur_item)

    for raw in text.splitlines():
        line = raw.rstrip()
        s = line.strip()
        if not s:
            continue
        if s.startswith("제목:"):
            title = s[3:].strip()
            continue
        m = re.match(r"^\[(.+?)\]$", s)
        if m and m.group(1) in SECTION_NAMES:
            flush()
            cur_name, cur_item, mode = m.group(1), None, None
            sections.setdefault(cur_name, [])
            continue
        m = re.match(r"^(\d{1,2})\.\s*\[\s*(.+?)\s*\]\s*(\(3점\))?\s*$", s)
        if m:
            flush()
            cur_item = {
                "no": int(m.group(1)),
                "type": m.group(2),
                "points": 3 if m.group(3) else 2,
                "summary": "",     # 유형 라벨 아래 '* …' 문항 총평
                "answer": "",
                "correct": "",
                "notes": [],       # 정답 해설 아래 '→ …' 보충
                "wrong": [],       # [{sym, text, notes}]
            }
            mode = None
            continue
        if cur_item is None:
            continue
        # 문항 총평 — 유형 라벨과 정답 해설 사이의 '* …' 한 줄
        if s.startswith("*") and not s.startswith("**") and mode is None:
            cur_item["summary"] = s.lstrip("*").strip()
            continue
        m = re.match(r"^정답\s*해설\s*[:：]\s*([①-⑤])\s*(.*)$", s)
        if m:
            cur_item["answer"] = m.group(1)
            cur_item["correct"] = m.group(2).strip()
            mode = "correct"
            continue
        if re.match(r"^오답\s*해설\s*$", s):
            mode = "wrong"
            continue
        # 보충 코멘트 — 바로 앞 해설에 딸린 별도 문단
        if s[0] in ARROWS:
            note = ARROW + " " + s[1:].strip()
            if mode == "wrong" and cur_item["wrong"]:
                cur_item["wrong"][-1]["notes"].append(note)
            else:
                cur_item["notes"].append(note)
            continue
        if mode == "correct":
            cur_item["correct"] = (cur_item["correct"] + " " + s).strip()
        elif mode == "wrong":
            if s[0] in CIRCLED:
                cur_item["wrong"].append({"sym": s[0], "text": s[1:].strip(), "notes": []})
            elif cur_item["wrong"]:
                cur_item["wrong"][-1]["text"] += " " + s
    flush()

    if not title:
        sys.exit("원고 첫머리에 '제목: …' 줄이 필요하다.")
    for name, items in sections.items():
        for it in items:
            if not it["answer"]:
                sys.exit(f"{name} {it['no']}번: '정답 해설 : ①' 줄을 찾지 못했다.")
    return title, sections


# ── XML 조립 ────────────────────────────────────────────────────────────
def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def archetypes(xml):
    body = re.search(r"<!--BODY-->(.*?)<!--/BODY-->", xml, re.S).group(1)
    paras = re.findall(r"<hp:p(?=[\s>]).*?</hp:p>", body, re.S)
    if len(paras) != 5:
        sys.exit(f"템플릿의 아키타입 문단이 5개가 아니다({len(paras)}개).")
    return dict(zip(["label", "answer", "wrong_label", "wrong", "blank"], paras))


def fill(para, placeholder, value):
    return para.replace(placeholder, value)


def build_items(arch, items):
    """총평(*)·보충(→)은 본문 문단 서식을 그대로 쓰되 각각 별도 문단으로 낸다."""
    out = []
    body = lambda txt: fill(arch["wrong"], "{{WRONG}}", txt)  # noqa: E731
    for it in sorted(items, key=lambda x: x["no"]):
        label = f"{it['no']:02d}. [<hp:fwSpace/>{esc(it['type'])}<hp:fwSpace/>]"
        out.append(fill(arch["label"], "{{LABEL}}", label))
        if it["summary"]:
            out.append(body(f"* {esc(it['summary'])}"))
        out.append(fill(arch["answer"], "{{ANSWER}}", f" {it['answer']} {esc(it['correct'])}"))
        for note in it["notes"]:
            out.append(body(esc(note)))
        if it["wrong"]:
            out.append(arch["wrong_label"])
            for w in it["wrong"]:
                out.append(body(f"{w['sym']} {esc(w['text'])}"))
                for note in w["notes"]:
                    out.append(body(esc(note)))
        out.append(arch["blank"])
    return "".join(out)


def fill_answer_table(tbl, items):
    """번호 칸(colAddr % 3 == 0) 오른쪽 두 칸에 정답·배점을 채운다."""
    cells = [m.group(0) for m in re.finditer(r"<hp:tc(?=[\s>]).*?</hp:tc>", tbl, re.S)]
    by_addr = {}
    for c in cells:
        m = re.search(r'<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"/>', c)
        if m:
            by_addr[(int(m.group(2)), int(m.group(1)))] = c

    def cell_text(c):
        m = re.search(r"<hp:t(?=[\s>])[^>]*>(.*?)</hp:t>", c, re.S)
        return re.sub(r"<[^>]+>", "", m.group(1)) if m else ""

    def set_text(c, v):
        return re.sub(r"(<hp:t(?=[\s>])[^>]*>).*?(</hp:t>)", lambda m: m.group(1) + v + m.group(2), c, count=1, flags=re.S)

    answers = {it["no"]: it for it in items}
    for (row, col), c in by_addr.items():
        if row == 0 or col % 3 != 0:
            continue
        t = cell_text(c).strip()
        if not t.isdigit():
            continue
        it = answers.get(int(t))
        if not it:
            continue
        for delta, val in ((1, it["answer"]), (2, str(it["points"]))):
            target = by_addr.get((row, col + delta))
            if target is None:
                continue
            tbl = tbl.replace(target, set_text(target, val), 1)
            by_addr[(row, col + delta)] = set_text(target, val)
    return tbl


def find_template():
    """스크립트 옆 · ../assets · 현재 폴더 순으로 템플릿을 찾는다."""
    here = Path(__file__).resolve().parent
    for p in (here / TEMPLATE_NAME, here.parent / "assets" / TEMPLATE_NAME, Path(TEMPLATE_NAME)):
        if p.exists():
            return str(p)
    return str(here.parent / "assets" / TEMPLATE_NAME)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("manuscript")
    ap.add_argument("output")
    ap.add_argument("--template", default=None)
    args = ap.parse_args()
    args.template = args.template or find_template()

    title, sections = parse(Path(args.manuscript).read_text(encoding="utf-8"))

    with zipfile.ZipFile(args.template) as z:
        names = z.namelist()
        files = {n: z.read(n) for n in names}
    xml = files[SECTION].decode("utf-8")
    arch = archetypes(xml)

    # 제목
    xml = xml.replace("{{TITLE}}", esc(title))

    # 공통과목 해설 본문
    common = sections.get("공통과목", [])
    xml = re.sub(
        r"<!--BODY-->.*?<!--/BODY-->",
        lambda _: build_items(arch, common),
        xml,
        flags=re.S,
    )

    # 선택과목 해설 — 원고에 있으면 '여백 처리' 문단을 대체한다
    placeholder_paras = re.findall(
        r"<hp:p(?=[\s>])(?:(?!</hp:p>).)*?해당 시험지는 선택과목이 없어.*?</hp:p>", xml, re.S
    )
    for i, name in enumerate(["화법과 작문", "언어와 매체"]):
        items = sections.get(name, [])
        if items and i < len(placeholder_paras):
            xml = xml.replace(placeholder_paras[i], build_items(arch, items), 1)

    # 정답표 3종
    tables = [m.group(0) for m in re.finditer(r"<hp:tbl(?=[\s>]).*?</hp:tbl>", xml, re.S) if "번호" in m.group(0)]
    for tbl, name in zip(tables, SECTION_NAMES):
        items = sections.get(name, [])
        if items:
            xml = xml.replace(tbl, fill_answer_table(tbl, items), 1)

    files[SECTION] = xml.encode("utf-8")

    out = Path(args.output)
    if out.exists():
        out.unlink()
    if "mimetype" not in files:
        sys.exit("템플릿에 mimetype 항목이 없다 — 이대로 만들면 한글이 hwpx 로 알아보지 못한다.")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        # hwpx 는 mimetype 이 '압축 없이 맨 앞' 항목이어야 한글이 알아본다
        z.writestr(zipfile.ZipInfo("mimetype"), files.pop("mimetype"), zipfile.ZIP_STORED)
        for n, data in files.items():
            if n.endswith("/"):      # 디렉터리 항목은 넣지 않는다
                continue
            z.writestr(n, data)

    total = sum(len(v) for v in sections.values())
    print(f"{out} 생성 완료 — {total}문항 "
          + ", ".join(f"{k} {len(v)}" for k, v in sections.items() if v))


if __name__ == "__main__":
    main()
