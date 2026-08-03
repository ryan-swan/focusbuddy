#!/usr/bin/env python3
"""Verify PLEXI-0001 v2.0: TOC anchors, heading structure, mermaid, tables, coverage."""
import re, sys, unicodedata, collections

DOC = "/root/plexi/PLEXI-0001-v2.0.md"
text = open(DOC, encoding="utf-8").read()
lines = text.split("\n")
fail = []

# ---------- 1. fenced code blocks balanced ----------
fences = [i for i, l in enumerate(lines) if l.strip().startswith("```")]
if len(fences) % 2:
    fail.append(f"Unbalanced code fences: {len(fences)} fence markers")
print(f"[1] code fences ....... {len(fences)} markers, {'balanced' if len(fences)%2==0 else 'UNBALANCED'}")

# map of which lines are inside fences
inside = set()
for a, b in zip(fences[0::2], fences[1::2]):
    inside.update(range(a, b + 1))

# ---------- 2. mermaid blocks ----------
mer = []
for a, b in zip(fences[0::2], fences[1::2]):
    if lines[a].strip() == "```mermaid":
        mer.append((a + 1, lines[a+1:b]))
valid_starts = ("flowchart", "stateDiagram-v2", "sequenceDiagram", "graph")
for ln, body in mer:
    first = next((x.strip() for x in body if x.strip()), "")
    if not first.startswith(valid_starts):
        fail.append(f"mermaid at line {ln}: bad declaration {first!r}")
    # crude bracket balance across the block
    joined = "\n".join(body)
    for o, c in "[]", "()", "{}":
        if joined.count(o) != joined.count(c):
            fail.append(f"mermaid at line {ln}: unbalanced {o}{c} ({joined.count(o)}/{joined.count(c)})")
print(f"[2] mermaid blocks .... {len(mer)} found, all declarations valid"
      if not any('mermaid' in f for f in fail) else f"[2] mermaid blocks .... ISSUES")

# ---------- 3. TOC anchors ----------
def slug(h):
    """Reproduce GitHub's heading slugger: strip punctuation, then map EACH
    remaining whitespace char to a hyphen (GitHub does not collapse runs)."""
    s = h.strip().lower()
    s = s.replace("§", "")
    s = "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))
    s = re.sub(r"[^\w\s-]", "", s)       # drop punctuation incl. em dash
    s = s.strip()
    return re.sub(r"\s", "-", s)          # per-char, NOT collapsed

headings = {}
for i, l in enumerate(lines):
    if i in inside:
        continue
    m = re.match(r"^(#{1,6})\s+(.*)$", l)
    if m:
        headings.setdefault(slug(m.group(2)), []).append(i + 1)

toc_links = re.findall(r"\]\(#([a-z0-9\-]+)\)", text)
missing = sorted({a for a in toc_links if a not in headings})
if missing:
    fail.append(f"TOC anchors with no matching heading: {missing}")
print(f"[3] TOC anchors ....... {len(toc_links)} links, {len(missing)} broken")

# ---------- 4. section coverage §1-§88 ----------
found = set()
for l in lines:
    m = re.match(r"^##\s+§(\d+)", l)
    if m:
        found.add(int(m.group(1)))
expected = set(range(0, 89))   # §0 Conventions through §88
gaps = sorted(expected - found)
extra = sorted(found - expected)
if gaps:
    fail.append(f"Missing sections: {gaps}")
print(f"[4] sections .......... {len(found)}/88 present, missing {gaps or 'none'}, extra {extra or 'none'}")

# ---------- 5. markdown table integrity (column count per table) ----------
bad_tables = 0
tbl = []
def check(tbl, start):
    global bad_tables
    if len(tbl) < 2:
        return
    widths = [r.count("|") for r in tbl]
    if len(set(widths)) > 1:
        c = collections.Counter(widths)
        # allow the odd row if a cell legitimately contains an escaped pipe; report anyway
        bad_tables += 1
        print(f"    ! table at line {start}: inconsistent pipe counts {dict(c)}")
start = 0
for i, l in enumerate(lines):
    if i in inside:
        continue
    if l.startswith("|"):
        if not tbl:
            start = i + 1
        tbl.append(l)
    else:
        check(tbl, start); tbl = []
check(tbl, start)
print(f"[5] tables ............ {bad_tables} with inconsistent columns")
if bad_tables:
    fail.append(f"{bad_tables} malformed tables")

# ---------- 6. RFC 2119 keyword usage ----------
KW = ["MUST NOT", "MUST", "SHALL NOT", "SHALL", "SHOULD NOT", "SHOULD",
      "REQUIRED", "RECOMMENDED", "MAY", "OPTIONAL"]
req_rows = [l for l in lines if re.match(r"^\|\s*PLX-", l)]
no_kw = [l for l in req_rows if not any(k in l for k in KW)]
# PERF/MET target-table rows carry a measurable target rather than a keyword; the
# normative obligation to meet them lives in PLX-PERF-070..072 / PLX-MET-012..013.
target_rows = [l for l in no_kw if re.match(r"^\|\s*PLX-(PERF|MET)-\d+\s*\|", l)]
no_kw = [l for l in no_kw if l not in target_rows]
print(f"[6] RFC 2119 .......... {len(req_rows)} rows | {len(target_rows)} target-table rows "
      f"(keyword N/A) | {len(no_kw)} prose rows missing a keyword")
for l in no_kw[:6]:
    print("    ?", l[:110])
if no_kw:
    fail.append(f"{len(no_kw)} prose requirement rows lack an RFC 2119 keyword")

# ---------- 7. no lowercase 'must' presented as normative inside req rows ----------
lower = [l for l in req_rows if re.search(r"\bmust\b", l)]
print(f"[7] lowercase 'must' .. {len(lower)} in requirement rows (should be 0)")
for l in lower[:5]:
    print("    ?", l[:110])
if lower:
    fail.append(f"{len(lower)} requirement rows contain lowercase 'must'")

# ---------- 8. stats ----------
words = len(text.split())
indexed = len(re.findall(r"^\| \*\*PLX-", text, re.M))
print(f"\n[8] document .......... {len(lines)} lines, {words:,} words, {indexed} indexed requirements")

print("\n" + ("PASS — no blocking issues" if not fail else "FAIL:\n  - " + "\n  - ".join(fail)))
sys.exit(1 if fail else 0)
