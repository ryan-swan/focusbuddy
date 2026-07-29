#!/usr/bin/env python3
"""Generate Appendix A (requirement index) and verify document integrity."""
import re, sys, glob, os, collections

BUILD = os.path.dirname(os.path.abspath(__file__))
ORDER = ["00-front.md","01-conventions.md","02-part1.md","03-part2.md","04-part3.md",
         "05-part4.md","06-part5.md","07-part6.md","08-part7.md"]
APPX  = ["10-appendix-b-e.md","11-appendix-f-h.md"]

AREA_ORDER = ["PRIN","PRD","UX","A11Y","DOM","ARC","EVT","SYN","CTX","RES","GPH","SCH",
              "AI","AGT","CON","APP","EXT","DATA","API","SEC","OPS","ENG","PERF","MET"]

AREA_NAME = {
 "PRIN":"Foundational principles","PRD":"Product model","UX":"User experience",
 "A11Y":"Accessibility","DOM":"Domain model","ARC":"Platform & service architecture",
 "EVT":"Events, event store & contracts","SYN":"Synchronisation","CTX":"Context Engine",
 "RES":"Resume Engine","GPH":"Knowledge Graph","SCH":"Search",
 "AI":"AI orchestration & governance","AGT":"Agents","CON":"Connectors",
 "APP":"Native applications","EXT":"Marketplace & SDK","DATA":"Data architecture",
 "API":"API design","SEC":"Security & privacy","OPS":"Deployment & observability",
 "ENG":"Engineering standards","PERF":"Performance","MET":"Metrics",
}

# A requirement row: | PLX-AREA-NNN | statement | V | Src |
ROW = re.compile(r'^\|\s*(PLX-[A-Z0-9]+-\d+)\s*\|\s*(.+?)\s*\|\s*([TAID][TAID, ]*)\s*\|\s*([^|]*?)\s*\|\s*$')
# Perf table rows have a different shape: | ID | op | p50 | p95 | p99 | measurement | V |
PERFROW = re.compile(r'^\|\s*(PLX-PERF-\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([TAID][TAID, ]*)\s*\|\s*$')
# Metric table rows: | ID | metric | definition | baseline | target | V |
METROW = re.compile(r'^\|\s*(PLX-MET-\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([TAID][TAID, ]*)\s*\|\s*$')
SECTION = re.compile(r'^##\s+§(\d+)')
ANYID = re.compile(r'PLX-(?:[A-Z0-9]+)-\d+')

reqs = {}          # id -> (statement, verify, src, section)
dupes = []
order = []

for fn in ORDER:
    path = os.path.join(BUILD, fn)
    sec = "—"
    for line in open(path, encoding="utf-8"):
        m = SECTION.match(line)
        if m:
            sec = "§" + m.group(1)
            continue
        for rx, grabber in ((PERFROW, lambda m: (m.group(2).strip(), m.group(7).strip(), "§58")),
                            (METROW,  lambda m: (m.group(2).strip(), m.group(6).strip(), "§8")),
                            (ROW,     lambda m: (m.group(2).strip(), m.group(3).strip(), m.group(4).strip()))):
            m = rx.match(line.rstrip("\n"))
            if m:
                rid = m.group(1)
                stmt, ver, src = grabber(m)
                if rid in reqs:
                    dupes.append(rid)
                else:
                    reqs[rid] = (stmt, ver, src, sec)
                    order.append(rid)
                break

def key(rid):
    a = rid.split("-")[1]; n = int(rid.split("-")[2])
    return (AREA_ORDER.index(a) if a in AREA_ORDER else 99, n)

def summarise(s, limit=150):
    s = re.sub(r'\*\*(.+?)\*\*', r'\1', s)
    s = re.sub(r'`([^`]+)`', r'\1', s)
    s = re.sub(r'\s+', ' ', s).strip()
    if len(s) <= limit:
        return s
    cut = s[:limit]
    if " " in cut:
        cut = cut[:cut.rfind(" ")]
    return cut + " …"

# ---- build Appendix A ----
out = ["# Appendix A — Requirement Index", "",
       f"**{len(reqs)} normative requirements** across {len({r.split('-')[1] for r in reqs})} areas. "
       "Identifiers are permanent and are never reused (§0.2). "
       "Verification codes: **T** test · **A** analysis · **I** inspection · **D** demonstration (§0.3).", ""]

counts = collections.Counter(r.split("-")[1] for r in reqs)
out += ["## A.1 Requirements by area", "", "| Area | Domain | Count |", "|---|---|---|"]
for a in AREA_ORDER:
    if counts.get(a):
        out.append(f"| `{a}` | {AREA_NAME[a]} | {counts[a]} |")
out += [f"| | **Total** | **{len(reqs)}** |", ""]

out += ["## A.2 Full index", ""]
for a in AREA_ORDER:
    ids = sorted([r for r in reqs if r.split("-")[1] == a], key=key)
    if not ids:
        continue
    out += [f"### {a} — {AREA_NAME[a]}", "", "| ID | § | Requirement | V |", "|---|---|---|---|"]
    for rid in ids:
        stmt, ver, src, sec = reqs[rid]
        out.append(f"| **{rid}** | {sec} | {summarise(stmt)} | {ver} |")
    out.append("")

out += ["## A.3 Verification method distribution", ""]
vc = collections.Counter()
for _, (s, v, sr, se) in reqs.items():
    for c in "TAID":
        if c in v:
            vc[c] += 1
out += ["| Method | Requirements |", "|---|---|",
        f"| **T** — Test | {vc['T']} |", f"| **A** — Analysis | {vc['A']} |",
        f"| **I** — Inspection | {vc['I']} |", f"| **D** — Demonstration | {vc['D']} |", "",
        "Every requirement declares at least one method. A requirement without a verification "
        "method is not a requirement (§0.3).", "", "---", ""]

with open(os.path.join(BUILD, "09-appendix-a.md"), "w", encoding="utf-8") as f:
    f.write("\n".join(out))

# ---- verification ----
allfiles = ORDER + ["09-appendix-a.md"] + APPX
text = "".join(open(os.path.join(BUILD, f), encoding="utf-8").read() for f in allfiles)

referenced = set(ANYID.findall(text))
defined = set(reqs) | {f"PLX-INV-{i:02d}" for i in range(1, 14)} | {f"PLX-RSK-{i:02d}" for i in range(1, 15)}
dangling = sorted(referenced - defined)

print(f"Requirements defined : {len(reqs)}")
print(f"Duplicate IDs        : {dupes if dupes else 'none'}")
print(f"Dangling references  : {dangling if dangling else 'none'}")

# gaps within each area
print("\nID continuity per area (gaps are allowed but reported):")
for a in AREA_ORDER:
    ns = sorted(int(r.split("-")[2]) for r in reqs if r.split("-")[1] == a)
    if not ns:
        continue
    gaps = [n for n in range(ns[0], ns[-1] + 1) if n not in ns]
    # collapse runs
    print(f"  {a:5s} {len(ns):3d} ids, range {ns[0]}-{ns[-1]}, {len(gaps)} unused numbers")

sys.exit(1 if (dupes or dangling) else 0)
