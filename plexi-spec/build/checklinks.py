#!/usr/bin/env python3
"""Verify every wikilink in the vault resolves to a note and, where an anchor is
used, to a heading inside that note. Exit non-zero on any break."""
import os, re, sys, glob

VAULT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
notes, headings = {}, {}

for p in glob.glob(os.path.join(VAULT, "**", "*.md"), recursive=True):
    stem = os.path.splitext(os.path.basename(p))[0]
    notes.setdefault(stem, []).append(os.path.relpath(p, VAULT))
    fenced, hs = False, set()
    for l in open(p, encoding="utf-8").read().split("\n"):
        if l.strip().startswith("```"):
            fenced = not fenced; continue
        if fenced:
            continue
        m = re.match(r"^#{1,6}\s+(.*)$", l)
        if m:
            hs.add(m.group(1).strip())
            hs.add(re.sub(r"\*\*|`|\[\[|\]\]", "", m.group(1)).strip())
    headings[stem] = hs

LINK = re.compile(r"\[\[([^\]\|#]*?)(?:#([^\]\|]+?))?(?:\\?\|[^\]]*?)?\]\]")
bad_note, bad_anchor, total = [], [], 0

for p in glob.glob(os.path.join(VAULT, "**", "*.md"), recursive=True):
    rel  = os.path.relpath(p, VAULT)
    stem = os.path.splitext(os.path.basename(p))[0]
    fenced = False
    for ln, l in enumerate(open(p, encoding="utf-8").read().split("\n"), 1):
        if l.strip().startswith("```"):
            fenced = not fenced; continue
        if fenced:
            continue
        for m in LINK.finditer(l):
            total += 1
            target = (m.group(1) or "").strip()
            anchor = (m.group(2) or "").strip()
            if not target:                                   # [[#anchor]] — same note
                if anchor and anchor not in headings[stem]:
                    bad_anchor.append((rel, ln, m.group(0)))
                continue
            if target not in notes:
                bad_note.append((rel, ln, target)); continue
            if anchor and anchor not in headings.get(target, set()):
                bad_anchor.append((rel, ln, f"{target}#{anchor}"))

dupes = {k: v for k, v in notes.items() if len(v) > 1}

print(f"notes            : {len(notes)}")
print(f"wikilinks        : {total:,}")
print(f"broken targets   : {len(bad_note)}")
for r, ln, t in bad_note[:15]:   print(f"    {r}:{ln}  -> [[{t}]]")
print(f"broken anchors   : {len(bad_anchor)}")
for r, ln, t in bad_anchor[:15]: print(f"    {r}:{ln}  -> {t}")
print(f"duplicate names  : {len(dupes)}")
for k, v in list(dupes.items())[:10]: print(f"    {k}: {v}")

print("\n" + ("PASS — every link resolves" if not (bad_note or bad_anchor or dupes) else "FAIL"))
sys.exit(1 if (bad_note or bad_anchor or dupes) else 0)
