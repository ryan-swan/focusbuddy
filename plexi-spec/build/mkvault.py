#!/usr/bin/env python3
"""
Build the Plexi spec vault from the consolidated master document.

Optimised for Claude Code as the primary consumer:
  - CLAUDE.md at root (auto-loaded) carrying hard rules and navigation
  - section notes sized for whole-file reads (50-350 lines)
  - requirement registers grouped by area,each requirement an anchor heading
  - per-service IMPLEMENTATION BRIEFS that inline everything binding for that unit
  - machine-readable JSON indexes for one-shot querying
  - ADR stubs for the foreclosing decisions, pre-filled as OPEN
"""
import re, os, json, shutil, csv, io, collections

MASTER = "/root/plexi/PLEXI-0001-v2.0.md"
VAULT  = "/root/plexi/plexi-spec"

# ----------------------------------------------------------------- parse master
raw = open(MASTER, encoding="utf-8").read()
lines = raw.split("\n")

# fenced regions (never parse inside them)
fence_idx = [i for i, l in enumerate(lines) if l.strip().startswith("```")]
inside = set()
for a, b in zip(fence_idx[0::2], fence_idx[1::2]):
    inside.update(range(a, b + 1))

PART_RE    = re.compile(r"^# Part ([IVX]+) — (.+)$")
APPX_RE    = re.compile(r"^# Appendix ([A-H]) — (.+)$")
SECTION_RE = re.compile(r"^## §(\d+) (.+)$")

blocks, cur = [], None
part = ("0", "Front Matter")
for i, l in enumerate(lines):
    if i in inside:
        if cur: cur["body"].append(l)
        continue
    m = PART_RE.match(l)
    if m:
        part = (m.group(1), m.group(2)); continue
    m = APPX_RE.match(l)
    if m:
        if cur: blocks.append(cur)
        cur = {"kind": "appendix", "num": m.group(1), "title": m.group(2),
               "part": ("X", "Appendices"), "body": []}
        continue
    m = SECTION_RE.match(l)
    if m:
        if cur: blocks.append(cur)
        cur = {"kind": "section", "num": int(m.group(1)), "title": m.group(2),
               "part": part, "body": []}
        continue
    if cur: cur["body"].append(l)
if cur: blocks.append(cur)

sections  = [b for b in blocks if b["kind"] == "section"]
appendices = [b for b in blocks if b["kind"] == "appendix"]

# ----------------------------------------------------------------- requirements
ROW  = re.compile(r'^\|\s*(PLX-[A-Z0-9]+-\d+)\s*\|\s*(.+?)\s*\|\s*([TAID][TAID, ]*)\s*\|\s*([^|]*?)\s*\|\s*$')
PERF = re.compile(r'^\|\s*(PLX-PERF-\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([TAID][TAID, ]*)\s*\|\s*$')
MET  = re.compile(r'^\|\s*(PLX-MET-\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([TAID][TAID, ]*)\s*\|\s*$')

reqs = {}
for b in blocks:
    sec = f"§{b['num']}" if b["kind"] == "section" else f"Appendix {b['num']}"
    for l in b["body"]:
        m = PERF.match(l)
        if m:
            reqs[m.group(1)] = dict(id=m.group(1), area="PERF", section=sec,
                statement=f"{m.group(2).strip()} — p50 {m.group(3).strip()}, p95 {m.group(4).strip()}, "
                          f"p99 {m.group(5).strip()}. Measured: {m.group(6).strip()}.",
                verify=m.group(7).strip(), src="§58", kind="target"); continue
        m = MET.match(l)
        if m:
            reqs[m.group(1)] = dict(id=m.group(1), area="MET", section=sec,
                statement=f"{m.group(2).strip()} — {m.group(3).strip()} Baseline: {m.group(4).strip()}. "
                          f"Target: {m.group(5).strip()}.",
                verify=m.group(6).strip(), src="§8", kind="target"); continue
        m = ROW.match(l)
        if m:
            rid = m.group(1)
            if rid not in reqs:
                reqs[rid] = dict(id=rid, area=rid.split("-")[1], section=sec,
                                 statement=m.group(2).strip(), verify=m.group(3).strip(),
                                 src=m.group(4).strip(), kind="requirement")

AREA_NAME = {
 "PRIN":"Foundational principles","PRD":"Product model","UX":"User experience",
 "A11Y":"Accessibility","DOM":"Domain model","ARC":"Platform & service architecture",
 "EVT":"Events, event store & contracts","SYN":"Synchronisation","CTX":"Context Engine",
 "RES":"Resume Engine","GPH":"Knowledge Graph","SCH":"Search",
 "AI":"AI orchestration & governance","AGT":"Agents","CON":"Connectors",
 "APP":"Native applications","EXT":"Marketplace & SDK","DATA":"Data architecture",
 "API":"API design","SEC":"Security & privacy","OPS":"Deployment & observability",
 "ENG":"Engineering standards","PERF":"Performance","MET":"Metrics"}
AREA_ORDER = list(AREA_NAME)

INV = {f"PLX-INV-{i:02d}": t for i, t in enumerate([
 "Every Object belongs to exactly one owning Desk",
 "Every meaningful change produces an Event",
 "Every Relationship has provenance",
 "AI never bypasses structured data",
 "Nothing deletes organisational memory",
 "Permissions propagate through relationships",
 "Everything remains inspectable",
 "Every Event is immutable once written",
 "Every recommendation is explainable",
 "Every service owns exactly one domain",
 "No service bypasses the Event Bus",
 "Workspace Memory is always recoverable",
 "Context survives application changes"], start=1)}

RISK = {
 "PLX-RSK-01": ("Immutable history vs right to erasure","Critical","first production Event"),
 "PLX-RSK-02": ("Event schema evolution over infinite horizon","Critical","first production Event"),
 "PLX-RSK-03": ("Context Health computation cost at scale","High","Phase 2 design"),
 "PLX-RSK-04": ("CRDT selection and metadata growth","High","Phase 1 design"),
 "PLX-RSK-05": ("AI unit economics","Critical","Phase 1 exit"),
 "PLX-RSK-06": ("Confidence score calibration","High","confidence display GA"),
 "PLX-RSK-07": ("Tenant isolation model per store","Critical","Phase 1 design"),
 "PLX-RSK-08": ("Event partition key and ordering","High","first production Event"),
 "PLX-RSK-09": ("Relationship existence as protected fact","Critical","Phase 2 entry"),
 "PLX-RSK-10": ("Prompt injection through ingested content","Critical","Phase 3 entry"),
 "PLX-RSK-11": ("Regulatory classification","High","Phase 4 entry"),
 "PLX-RSK-12": ("Presence telemetry as surveillance","High","Phase 1 exit"),
 "PLX-RSK-13": ("Accessibility of spatial metaphor","High","Phase 1 design"),
 "PLX-RSK-14": ("Competitive position undefended","Medium","Part VIII"),
}

# --------------------------------------------------------- service definitions
# Each service brief inlines EVERY binding requirement for that unit. Areas map
# broadly; explicit lists pin the cross-cutting requirements that also bind.
SERVICES = {
"Workspace Service": dict(
  sec=47.1, owns="Desk lifecycle · workspace layouts · window positions · Sessions · Object placement · visual persistence",
  notowns="Interpreting Object content; computing Context Health; generating Resumes",
  store="Relational (layout, session, membership)",
  emits=["DeskCreated","DeskActivated","DeskPaused","DeskArchived","DeskArchetypeChanged",
         "LayoutChanged","SessionStarted","SessionEnded","ObjectPlaced","ObjectMoved","ObjectResized"],
  consumes=["ObjectCreated","ObjectDeleted","PermissionChanged"],
  areas=["PRD"], extra=["PLX-UX-030","PLX-UX-031","PLX-UX-032","PLX-UX-033","PLX-DOM-050","PLX-DOM-051",
         "PLX-APP-010","PLX-APP-011","PLX-APP-012"],
  slo=["PLX-PERF-001","PLX-PERF-002"], inv=["PLX-INV-01","PLX-INV-02"], risk=["PLX-RSK-13"]),

"Object Service": dict(
  sec=47.2, owns="Object creation · storage · version history · sharing · metadata · lifecycle",
  notowns="Presentation; relationships; Context Health",
  store="Document store + blob store",
  emits=["ObjectCreated","ObjectUpdated","ObjectVersioned","ObjectShared","ObjectArchived",
         "ObjectDeleted","ObjectImported","ObjectExported"],
  consumes=["ConnectorSyncCompleted","PermissionChanged"],
  areas=[], extra=["PLX-PRD-001","PLX-PRD-010","PLX-PRD-011","PLX-PRD-012","PLX-PRD-013","PLX-PRD-014",
         "PLX-PRD-060","PLX-PRD-061","PLX-PRD-062","PLX-PRD-063","PLX-DOM-020","PLX-DOM-030",
         "PLX-DOM-031","PLX-DOM-032","PLX-DOM-040","PLX-DOM-041","PLX-DOM-042","PLX-DOM-043"],
  slo=["PLX-PERF-010"], inv=["PLX-INV-01","PLX-INV-02","PLX-INV-05"], risk=["PLX-RSK-09"]),

"Event Service": dict(
  sec=47.3, owns="Event creation · persistence · distribution · replay · audit",
  notowns="Exposing mutation or deletion of Event records via ANY interface",
  store="Event Store (append-only log) + partitioned bus",
  emits=["ReplayStarted","ReplayCompleted","RetentionPolicyApplied"],
  consumes=["*all Events*"],
  areas=["EVT"], extra=["PLX-DATA-002","PLX-DATA-003","PLX-SEC-030","PLX-OPS-014","PLX-ENG-012"],
  slo=["PLX-PERF-030","PLX-PERF-031"],
  inv=["PLX-INV-02","PLX-INV-05","PLX-INV-08","PLX-INV-11","PLX-INV-12"],
  risk=["PLX-RSK-01","PLX-RSK-02","PLX-RSK-08"]),

"Context Engine": dict(
  sec=47.4, owns="Current understanding · Context Health · Resume triggers · dependency tracking · materiality",
  notowns="Calling AI models in the deterministic scoring path",
  store="Context DB (per-user per-Object health; Context Objects)",
  emits=["ContextHealthChanged","MaterialityScored","DependencyImpactDetected","ContextGenerated","AttentionRaised"],
  consumes=["*all domain Events*","RelationshipConfirmed","DecisionSuperseded"],
  areas=["CTX"], extra=["PLX-UX-020","PLX-UX-021","PLX-UX-022","PLX-UX-023","PLX-UX-024","PLX-UX-025",
         "PLX-PRD-020","PLX-PRD-021","PLX-PRD-022","PLX-EVT-020","PLX-EVT-021","PLX-DOM-030"],
  slo=["PLX-PERF-020","PLX-PERF-021"], inv=["PLX-INV-04","PLX-INV-06","PLX-INV-07"],
  risk=["PLX-RSK-03","PLX-RSK-12"]),

"Resume Engine": dict(
  sec=47.5, owns="Resume generation · Workspace Memory · context compression · catch-up estimation",
  notowns="Deleting or mutating source Events during compression",
  store="Resume DB (versioned Resume Objects, compression artefacts)",
  emits=["ResumeGenerated","ResumeSuperseded","MemoryCompressed","CatchupEstimated"],
  consumes=["ContextHealthChanged","MaterialityScored","SessionEnded","DecisionApproved"],
  areas=["RES"], extra=["PLX-PRD-030","PLX-PRD-031","PLX-PRD-032","PLX-PRD-033","PLX-PRD-034",
         "PLX-PRD-040","PLX-PRD-041","PLX-PRD-042","PLX-PRD-043","PLX-PRD-044",
         "PLX-UX-050","PLX-UX-051","PLX-UX-052","PLX-DATA-010","PLX-DATA-011","PLX-DATA-012"],
  slo=["PLX-PERF-011","PLX-PERF-012"], inv=["PLX-INV-05","PLX-INV-07","PLX-INV-12"],
  risk=["PLX-RSK-06"]),

"Graph Engine": dict(
  sec=47.6, owns="Knowledge graph · relationship storage · traversal · discovery · dependency analysis",
  notowns="Emitting confirmed Relationships from AI discovery",
  store="Graph DB (tenant-namespaced)",
  emits=["RelationshipDiscovered","RelationshipConfirmed","RelationshipRejected",
         "RelationshipSuperseded","DuplicateDetected","ClusterFormed"],
  consumes=["*all domain Events*","EmbeddingUpdated"],
  areas=["GPH"], extra=["PLX-PRD-050","PLX-PRD-051","PLX-PRD-052","PLX-PRD-053",
         "PLX-SEC-010","PLX-SEC-011","PLX-CTX-026"],
  slo=["PLX-PERF-022"], inv=["PLX-INV-03","PLX-INV-06"], risk=["PLX-RSK-07","PLX-RSK-09"]),

"Search Service": dict(
  sec=47.7, owns="Keyword · semantic · graph · hybrid ranking · context-aware search",
  notowns="Returning results before permission filtering",
  store="Search index + vector index",
  emits=["SearchExecuted","EmbeddingUpdated"],
  consumes=["ObjectCreated","ObjectUpdated","ObjectDeleted","PermissionChanged","RelationshipConfirmed"],
  areas=["SCH"], extra=["PLX-UX-040","PLX-UX-041","PLX-PRD-014","PLX-SEC-023"],
  slo=["PLX-PERF-040","PLX-PERF-041","PLX-PERF-042"], inv=["PLX-INV-06"], risk=["PLX-RSK-07","PLX-RSK-09"]),

"AI Orchestrator": dict(
  sec=47.8, owns="Model routing · prompt assembly · agent coordination · tool invocation · cost · caching · AI policy",
  notowns="Writing domain state directly; bypassing permission evaluation",
  store="Prompt cache, reasoning cache, cost ledger",
  emits=["ReasoningRequested","ReasoningCompleted","ReasoningRejected","ModelRouted",
         "CostRecorded","CostCeilingExceeded"],
  consumes=["AttentionRaised","ContextGenerated","ResumeGenerated","*agent task requests*"],
  areas=["AI"], extra=["PLX-UX-060","PLX-UX-061","PLX-UX-062","PLX-UX-063","PLX-ARC-022",
         "PLX-EVT-020","PLX-EVT-021","PLX-DOM-014","PLX-SEC-025"],
  slo=["PLX-PERF-050"], inv=["PLX-INV-04","PLX-INV-07","PLX-INV-09"],
  risk=["PLX-RSK-05","PLX-RSK-06","PLX-RSK-10","PLX-RSK-11"]),

"Automation Engine": dict(
  sec=47.9, owns="Workflow execution · triggers · actions · scheduling · approvals · long-running workflows",
  notowns="Executing an action exceeding the initiating principal's permissions",
  store="Workflow DB (durable execution state)",
  emits=["WorkflowStarted","WorkflowStepCompleted","WorkflowCompleted","WorkflowFailed",
         "ApprovalRequested","ApprovalGranted","ApprovalDeclined"],
  consumes=["*all Events as trigger sources*"],
  areas=[], extra=["PLX-DOM-040","PLX-SEC-020","PLX-SEC-021","PLX-SEC-022","PLX-EVT-015"],
  slo=[], inv=["PLX-INV-02","PLX-INV-06"], risk=["PLX-RSK-10"]),

"Connector Service": dict(
  sec=47.10, owns="External applications · authentication · integrations · webhooks · import · export · sync",
  notowns="Storing third-party credentials outside the credential vault",
  store="Connector config, credential vault references, sync cursors",
  emits=["ConnectorConnected","ConnectorDisconnected","ConnectorSyncStarted",
         "ConnectorSyncCompleted","ConnectorSyncFailed","ExternalObjectImported"],
  consumes=["ObjectUpdated","WorkflowStepCompleted"],
  areas=["CON"], extra=["PLX-PRIN-002","PLX-SEC-024","PLX-EVT-015","PLX-DATA-006"],
  slo=[], inv=["PLX-INV-06","PLX-INV-13"], risk=["PLX-RSK-10"]),

"Identity Service": dict(
  sec=47.11, owns="Authentication · authorisation · users · groups · roles · permissions · audit",
  notowns="Being bypassed by any service for authorisation decisions",
  store="Relational (identity, roles, policy)",
  emits=["UserCreated","UserDeactivated","RoleAssigned","PermissionChanged",
         "AuthenticationFailed","PolicyChanged","ErasureExecuted"],
  consumes=[],
  areas=["SEC"], extra=["PLX-PRD-070","PLX-PRD-071","PLX-PRD-072","PLX-EVT-012","PLX-EVT-033",
         "PLX-AGT-001","PLX-AGT-005"],
  slo=["PLX-PERF-060"], inv=["PLX-INV-06"], risk=["PLX-RSK-01","PLX-RSK-07","PLX-RSK-09","PLX-RSK-12"]),
}

ENTITIES = {
 "Desk":         (33, ["PLX-PRD-001","PLX-PRD-002","PLX-PRD-003","PLX-PRD-004","PLX-PRD-005",
                       "PLX-PRD-006","PLX-DOM-020","PLX-DOM-021","PLX-DOM-022"], ["PLX-INV-01"]),
 "Object":       (34, ["PLX-PRD-010","PLX-PRD-011","PLX-PRD-012","PLX-PRD-013","PLX-PRD-014",
                       "PLX-DOM-030","PLX-DOM-031","PLX-DOM-032"], ["PLX-INV-01","PLX-INV-05"]),
 "Event":        (35, ["PLX-EVT-010","PLX-EVT-011","PLX-EVT-012","PLX-EVT-013","PLX-EVT-014",
                       "PLX-EVT-015","PLX-EVT-040","PLX-EVT-041","PLX-EVT-042","PLX-EVT-043",
                       "PLX-EVT-044","PLX-EVT-045"], ["PLX-INV-02","PLX-INV-08"]),
 "Relationship": (36, ["PLX-GPH-001","PLX-GPH-002","PLX-GPH-003","PLX-GPH-004","PLX-GPH-005",
                       "PLX-GPH-020","PLX-GPH-021","PLX-GPH-022"], ["PLX-INV-03"]),
 "Decision":     (37, ["PLX-DOM-040","PLX-DOM-041","PLX-DOM-042","PLX-DOM-043","PLX-APP-020"], ["PLX-INV-07"]),
 "Context":      (38, ["PLX-CTX-001","PLX-CTX-002","PLX-PRD-020","PLX-PRD-021","PLX-PRD-022","PLX-PRD-023"], []),
 "Resume":       (39, ["PLX-RES-001","PLX-RES-002","PLX-RES-003","PLX-RES-004"], ["PLX-INV-07"]),
 "Session":      (40, ["PLX-DOM-050","PLX-DOM-051","PLX-PRD-031","PLX-UX-072"], []),
 "Agent":        (41, ["PLX-AGT-001","PLX-AGT-002","PLX-AGT-003","PLX-AGT-004","PLX-AGT-005",
                       "PLX-AGT-006","PLX-AGT-010","PLX-AGT-011","PLX-AGT-012","PLX-AGT-013",
                       "PLX-AGT-014","PLX-AGT-015","PLX-AGT-020","PLX-AGT-021","PLX-AGT-022",
                       "PLX-AGT-023"], ["PLX-INV-04"]),
 "Organisation": (42, ["PLX-SEC-010","PLX-SEC-011","PLX-DATA-004"], ["PLX-INV-06"]),
}

PART_DIR = {
 "0": "00-meta", "I": "01-vision", "II": "02-product-model", "III": "03-user-experience",
 "IV": "04-domain-model", "V": "05-platform-architecture", "VI": "06-data-apis-security",
 "VII": "07-applications-agents-roadmap", "X": "registers"}
PART_TITLE = {
 "I": "Vision", "II": "Product Model", "III": "User Experience", "IV": "Domain Model",
 "V": "Platform Architecture", "VI": "Data, APIs, Security & Engineering Standards",
 "VII": "Applications, Agents, Algorithms & Roadmap"}

# ----------------------------------------------------------------- helpers
def slugfile(s):
    return re.sub(r"[^\w \-&,—–]", "", s).strip()

def sec_note_name(b):
    return f"S{b['num']:02d} {slugfile(b['title'])}" if b["kind"] == "section" else \
           f"Appendix {b['num']} — {slugfile(b['title'])}"

SEC_INDEX = {b["num"]: sec_note_name(b) for b in sections}

def linkify(text, self_name=None):
    """Turn bare IDs and §refs into wikilinks, skipping fenced code."""
    out, fenced = [], False
    for l in text.split("\n"):
        if l.strip().startswith("```"):
            fenced = not fenced; out.append(l); continue
        if fenced:
            out.append(l); continue
        # requirement ids -> register anchor
        def rl(m):
            rid = m.group(0)
            if rid in reqs:
                return f"[[REQ-{reqs[rid]['area']}#{rid}|{rid}]]"
            if rid in INV:
                return f"[[Invariants#{rid}|{rid}]]"
            if rid in RISK:
                return f"[[Risk Register#{rid}|{rid}]]"
            return rid
        l = re.sub(r"(?<!\[\[)(?<!\|)PLX-[A-Z0-9]+-\d+", rl, l)
        # §NN -> section note (skip §NN.N sub-refs and self-references)
        def sl(m):
            n = int(m.group(1))
            if n in SEC_INDEX and SEC_INDEX[n] != self_name:
                return f"[[{SEC_INDEX[n]}|§{n}]]"
            return m.group(0)
        l = re.sub(r"§(\d+)(?![\d.])", sl, l)
        out.append(l)
    return "\n".join(out)

def fm(**kw):
    s = ["---"]
    for k, v in kw.items():
        if isinstance(v, list):
            s.append(f"{k}:")
            s += [f"  - {x}" for x in v]
        else:
            s.append(f"{k}: {v}")
    s.append("---")
    return "\n".join(s)

def w(path, text):
    p = os.path.join(VAULT, path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "w", encoding="utf-8").write(text.rstrip() + "\n")

# Regenerate ONLY the generated trees. CLAUDE.md, Home.md and build/ are
# hand-authored and must survive a rebuild.
GENERATED = ["00-meta","01-vision","02-product-model","03-user-experience","04-domain-model",
             "05-platform-architecture","06-data-apis-security","07-applications-agents-roadmap",
             "registers","entities","services","decisions","_index"]
for _g in GENERATED:
    _p = os.path.join(VAULT, _g)
    if os.path.isdir(_p):
        shutil.rmtree(_p)

# ----------------------------------------------------------------- section notes
written = collections.Counter()
for b in sections:
    name = sec_note_name(b)
    pnum = b["part"][0]
    d = PART_DIR.get(pnum, "00-meta")
    body = linkify("\n".join(b["body"]).strip(), name)
    ids = sorted({m for m in re.findall(r"PLX-[A-Z0-9]+-\d+", "\n".join(b["body"]))})
    rids = [i for i in ids if i in reqs]
    prev = SEC_INDEX.get(b["num"] - 1); nxt = SEC_INDEX.get(b["num"] + 1)
    nav = " · ".join(filter(None, [
        f"◀ [[{prev}]]" if prev else None,
        f"[[{'Part ' + pnum + ' — ' + PART_TITLE[pnum] if pnum in PART_TITLE else 'Home'}|▲ Part {pnum}]]" if pnum in PART_TITLE else "[[Home|▲ Home]]",
        f"[[{nxt}]] ▶" if nxt else None]))
    txt = (fm(id=f"S{b['num']}", section=f"§{b['num']}", title=f'"{b["title"]}"',
              part=f"{pnum}", type="section",
              defines=[i for i in rids] or None,
              tags=[f"section", f"part/{pnum.lower()}"]).replace("\ndefines:\nNone", "")
           + f"\n\n# §{b['num']} {b['title']}\n\n{nav}\n\n---\n\n{body}\n\n---\n\n"
           + (f"## Requirements defined or cited here\n\n"
              + "\n".join(f"- [[REQ-{reqs[i]['area']}#{i}|{i}]] — {reqs[i]['statement'][:110].rstrip()}"
                          for i in rids) + "\n\n" if rids else "")
           + f"{nav}\n")
    w(f"{d}/{name}.md", txt)
    written[d] += 1

for b in appendices:
    name = sec_note_name(b)
    body = linkify("\n".join(b["body"]).strip(), name)
    w(f"registers/{name}.md",
      fm(type="appendix", appendix=b["num"], title=f'"{b["title"]}"', tags=["appendix"])
      + f"\n\n# Appendix {b['num']} — {b['title']}\n\n[[Home|▲ Home]]\n\n---\n\n{body}\n")

# ----------------------------------------------------------------- REQ registers
for area in AREA_ORDER:
    ids = sorted([r for r in reqs if reqs[r]["area"] == area],
                 key=lambda r: int(r.split("-")[2]))
    if not ids: continue
    body = [fm(type="requirement-register", area=area, domain=f'"{AREA_NAME[area]}"',
               count=len(ids), tags=["requirements", f"area/{area.lower()}"]),
            "", f"# REQ-{area} — {AREA_NAME[area]}", "",
            f"{len(ids)} normative requirements. Identifiers are permanent and never reused.",
            "", "> [!important] For Claude Code",
            f"> Every requirement below is binding. Cite the ID in the test name that verifies it "
            f"(`test_{ids[0].lower().replace('-','_')}_*`) so [[S74 Definition of Done|§74]] gate 13 "
            f"(requirement-to-test traceability) can be machine-checked.", "",
            "| ID | § | V | Summary |", "|---|---|---|---|"]
    for i in ids:
        r = reqs[i]
        s = re.sub(r"\s+", " ", re.sub(r"\*\*|`", "", r["statement"]))[:130]
        body.append(f"| [[#{i}]] | {r['section']} | {r['verify']} | {s} |")
    body.append("")
    body.append("---")
    body.append("")
    for i in ids:
        r = reqs[i]
        secnum = r["section"].lstrip("§")
        secl = f"[[{SEC_INDEX[int(secnum)]}|{r['section']}]]" if secnum.isdigit() and int(secnum) in SEC_INDEX else r["section"]
        body += [f"### {i}", "",
                 linkify(r["statement"]), "",
                 f"| | |", f"|---|---|",
                 f"| **Verification** | `{r['verify']}` |",
                 f"| **Defined in** | {secl} |",
                 f"| **Derives from** | {linkify(r['src'])} |",
                 f"| **Test name** | `test_{i.lower().replace('-','_')}` |", ""]
    w(f"registers/REQ-{area}.md", "\n".join(body))

# ----------------------------------------------------------------- service briefs
for svc, d in SERVICES.items():
    picked = sorted({*(r for r in reqs if reqs[r]["area"] in d["areas"]), *d["extra"]},
                    key=lambda r: (AREA_ORDER.index(reqs[r]["area"]), int(r.split("-")[2])))
    lines_ = [fm(type="service-brief", service=f'"{svc}"', spec_section=f"§{d['sec']}",
                 requirements=len(picked), tags=["service","implementation-brief"],
                 blocked_by=d["risk"] or None).replace("\nblocked_by:\nNone",""),
        "", f"# {svc} — implementation brief", "",
        f"[[Home|▲ Home]] · [[S47 Service Architecture|§47 Service Architecture]] · "
        f"[[S46 High-Level System Architecture|§46 Topology]]", "",
        "> [!abstract] What this note is",
        "> Everything binding on this service, in one file. Read this before writing any of it.",
        "> Nothing here is optional and nothing here is a summary — each requirement is quoted in full.",
        "", "## Boundary", "",
        f"**Owns** — {d['owns']}", "",
        f"**MUST NOT** — {d['notowns']}", "",
        f"**Datastore** — {d['store']}  *(owned exclusively; see [[REQ-ARC#PLX-ARC-001|PLX-ARC-001]])*", ""]
    if d["emits"]:
        lines_ += ["## Events emitted", "",
                   "\n".join(f"- `{e}`" for e in d["emits"]), "",
                   "Emitting an Event not listed here violates the service contract in "
                   "[[S47 Service Architecture|§47]]. Add it to the contract first.", ""]
    if d["consumes"]:
        lines_ += ["## Events consumed", "", "\n".join(f"- `{e}`" for e in d["consumes"]), ""]
    if d["slo"]:
        lines_ += ["## Service level objectives", "", "| ID | Target |", "|---|---|"]
        lines_ += [f"| [[REQ-PERF#{s}|{s}]] | {reqs[s]['statement']} |" for s in d["slo"] if s in reqs]
        lines_ += ["", "Measured at reference load defined in [[S58 Performance Requirements|§58]]. "
                   "A target without production instrumentation MUST NOT be claimed as met "
                   "([[REQ-PERF#PLX-PERF-070|PLX-PERF-070]]).", ""]
    if d["inv"]:
        lines_ += ["## Invariants this service can violate", "", "| ID | Invariant |", "|---|---|"]
        lines_ += [f"| [[Invariants#{i}\\|{i}]] | {INV[i]} |" for i in d["inv"]]
        lines_ += ["", "Each MUST have an automated detection test in this service's suite "
                   "([[REQ-ENG#PLX-ENG-001|PLX-ENG-001]]).", ""]
    if d["risk"]:
        lines_ += ["## Open decisions blocking this service", "",
                   "> [!warning] Do not invent resolutions to these.",
                   "> They are unresolved in the specification. If implementation forces the question, "
                   "stop and record an ADR in `decisions/` rather than choosing silently.", "",
                   "| Risk | Severity | Required by |", "|---|---|---|"]
        lines_ += [f"| [[Risk Register#{r}\\|{r}]] — {RISK[r][0]} | {RISK[r][1]} | {RISK[r][2]} |" for r in d["risk"]]
        lines_ += [""]
    lines_ += ["---", "", f"## Binding requirements ({len(picked)})", ""]
    for i in picked:
        r = reqs[i]
        secnum = r["section"].lstrip("§")
        secl = f"[[{SEC_INDEX[int(secnum)]}|{r['section']}]]" if secnum.isdigit() and int(secnum) in SEC_INDEX else r["section"]
        lines_ += [f"#### [[REQ-{r['area']}#{i}\\|{i}]]  ·  `{r['verify']}`  ·  {secl}", "",
                   linkify(r["statement"]), ""]
    lines_ += ["---", "", "## Definition of done for this service", "",
        "Every gate in [[S74 Definition of Done|§74]] applies. Service-specific:", "",
        "- [ ] Every requirement above has a linked passing test named `test_<id>` "
        "([[REQ-ENG#PLX-ENG-021|PLX-ENG-021]])",
        "- [ ] Every invariant above has a detection test that fails when violated "
        "([[REQ-ENG#PLX-ENG-001|PLX-ENG-001]])",
        "- [ ] OpenAPI + AsyncAPI contracts published and validated in CI "
        "([[REQ-ARC#PLX-ARC-020|PLX-ARC-020]])",
        "- [ ] Failure modes and recovery documented ([[REQ-ARC#PLX-ARC-021|PLX-ARC-021]])",
        "- [ ] Contract tests exist against every producer and consumer "
        "([[REQ-ENG#PLX-ENG-011|PLX-ENG-011]])",
        "- [ ] Service degrades deterministically when the AI Orchestrator is unavailable "
        "([[REQ-ARC#PLX-ARC-022|PLX-ARC-022]])",
        "- [ ] Tenant isolation enforced at the storage layer, not application code "
        "([[REQ-SEC#PLX-SEC-010|PLX-SEC-010]])", ""]
    w(f"services/{svc}.md", "\n".join(lines_))

# ----------------------------------------------------------------- entity notes
for ent, (sec, rids, invs) in ENTITIES.items():
    schema = ""
    for b in sections:
        if b["num"] == sec:
            m = re.search(r"```typescript\n(.*?)```", "\n".join(b["body"]), re.S)
            if m: schema = m.group(1).rstrip()
    body = [fm(type="entity", entity=ent, spec_section=f"§{sec}", tags=["entity","domain-model"]),
        "", f"# {ent}", "",
        f"[[Home|▲ Home]] · [[{SEC_INDEX[sec]}|§{sec} — full definition]] · "
        f"[[S32 Canonical Entity Model|§32 BaseEntity]]", "",
        "> [!abstract] Canonical schema", f"> Defined in [[{SEC_INDEX[sec]}|§{sec}]]. "
        f"All entities inherit [[S32 Canonical Entity Model|BaseEntity]] — do not invent a "
        f"separate identity model ([[REQ-DOM#PLX-DOM-010|PLX-DOM-010]]).", ""]
    if schema:
        body += ["## Schema", "", "```typescript", schema, "```", ""]
    body += ["## Binding requirements", "", "| ID | V | Requirement |", "|---|---|---|"]
    for i in rids:
        if i in reqs:
            body.append(f"| [[REQ-{reqs[i]['area']}#{i}\\|{i}]] | {reqs[i]['verify']} | "
                        f"{re.sub(r'[|]', '/', re.sub(chr(10), ' ', reqs[i]['statement']))} |")
    body.append("")
    if invs:
        body += ["## Invariants", "", "\n".join(f"- [[Invariants#{i}|{i}]] — {INV[i]}" for i in invs), ""]
    w(f"entities/{ent}.md", "\n".join(body))

# ----------------------------------------------------------------- registers: INV / RISK
inv_txt = [fm(type="register", register="invariants", count=len(INV), tags=["invariants"]),
  "", "# Invariants", "",
  "An invariant is stronger than a requirement. A requirement describes something the system does; "
  "an invariant describes something the system can **never stop doing**.", "",
  "> [!danger] Every invariant MUST have an automated detection test that fails when it is violated "
  "([[REQ-ENG#PLX-ENG-001|PLX-ENG-001]]). An invariant asserted only in documentation is not enforced.", ""]
inv_src = "\n".join("\n".join(b["body"]) for b in appendices if b["num"] == "B")
for iid, title in INV.items():
    row = next((l for l in inv_src.split("\n") if l.startswith(f"| **{iid}**")), "")
    cells = [c.strip() for c in row.split("|")[1:-1]] if row else []
    inv_txt += [f"### {iid}", "", f"**{title}.**", ""]
    if len(cells) >= 5:
        inv_txt += ["| | |", "|---|---|",
                    f"| **Full statement** | {linkify(cells[1])} |",
                    f"| **Enforcement** | {linkify(cells[2])} |",
                    f"| **Detection test** | {linkify(cells[3])} |",
                    f"| **Source** | {linkify(cells[4])} |", ""]
    svcs = [s for s, d in SERVICES.items() if iid in d["inv"]]
    if svcs:
        inv_txt += ["**Services that can violate it:** " + " · ".join(f"[[{s}]]" for s in svcs), ""]
w("registers/Invariants.md", "\n".join(inv_txt))

risk_src = "\n".join("\n".join(b["body"]) for b in appendices if b["num"] == "F")
risk_txt = [fm(type="register", register="risks", count=len(RISK), tags=["risks","open-decisions"]),
  "", "# Risk Register", "",
  "> [!danger] For Claude Code — read this before implementing anything",
  "> These are **unresolved decisions**, not solved problems. If implementation forces one of these "
  "questions, **stop and write an ADR in `decisions/`** rather than choosing silently. "
  "A silent choice here becomes a foreclosing decision nobody agreed to.", "",
  "Five must be resolved before the first production Event is written. See "
  "[[S85 Five-Year Product Roadmap|§85.2]].", "",
  "| ID | Risk | Severity | Required by | Blocks |", "|---|---|---|---|---|"]
for rid, (t, sev, by) in RISK.items():
    blk = " · ".join(f"[[{s}]]" for s, d in SERVICES.items() if rid in d["risk"]) or "—"
    risk_txt.append(f"| [[#{rid}]] | {t} | **{sev}** | {by} | {blk} |")
risk_txt += ["", "---", ""]
for chunk in re.split(r"\n### (?=PLX-RSK-)", risk_src):
    m = re.match(r"(PLX-RSK-\d+) — (.+?)\n", chunk)
    if not m: continue
    rid = m.group(1)
    rest = chunk[chunk.index("\n"):].strip()
    blk = [s for s, d in SERVICES.items() if rid in d["risk"]]
    risk_txt += [f"### {rid}", "", f"**{m.group(2)}**", "", linkify(rest), ""]
    if blk:
        risk_txt += ["**Blocks:** " + " · ".join(f"[[{s}]]" for s in blk), ""]
    risk_txt += [f"**ADR:** `decisions/ADR-{rid[-2:]} {slugfile(m.group(2))}.md`", "", "---", ""]
w("registers/Risk Register.md", "\n".join(risk_txt))

# ----------------------------------------------------------------- ADR stubs
ADR_ORDER = ["PLX-RSK-01","PLX-RSK-02","PLX-RSK-08","PLX-RSK-04","PLX-RSK-07",
             "PLX-RSK-13","PLX-RSK-03","PLX-RSK-05","PLX-RSK-12","PLX-RSK-09",
             "PLX-RSK-06","PLX-RSK-10","PLX-RSK-11","PLX-RSK-14"]
for n, rid in enumerate(ADR_ORDER, start=1):
    t, sev, by = RISK[rid]
    w(f"decisions/ADR-{n:02d} {slugfile(t)}.md",
      fm(type="adr", adr=f"{n:02d}", status="OPEN", severity=sev,
         required_by=f'"{by}"', risk=rid, tags=["adr","open"])
      + f"""

# ADR-{n:02d} — {t}

> [!danger] Status: **OPEN** · Severity: **{sev}** · Required by: **{by}**
> This decision is unresolved. Do not implement around it. Do not let an implementation
> detail settle it by default.

**Risk:** [[Risk Register#{rid}|{rid}]]

## Context

See [[Risk Register#{rid}|{rid}]] in the risk register for the full statement of the
tension, why it cannot wait, and the open sub-questions.

## Options considered

| # | Option | Consequence | Reversible? |
|---|---|---|---|
| 1 | | | |
| 2 | | | |

## Decision

*Not yet made.*

## Consequences

*To be completed when the decision is made.*

## Requirements affected

*List every `PLX-*` requirement this decision changes or discharges. Update the affected
requirement notes in `registers/` when this ADR moves to ACCEPTED.*

## Verification

*How will we know the decision was implemented correctly? Name the tests.*
""")

# ----------------------------------------------------------------- part MOCs
for pnum, ptitle in PART_TITLE.items():
    secs = [b for b in sections if b["part"][0] == pnum]
    if not secs: continue
    rows = []
    for b in secs:
        ids = sorted({m for m in re.findall(r"PLX-[A-Z0-9]+-\d+", "\n".join(b["body"])) if m in reqs})
        rows.append(f"| [[{sec_note_name(b)}\\|§{b['num']} {b['title']}]] | {len(ids)} |")
    w(f"{PART_DIR[pnum]}/Part {pnum} — {ptitle}.md",
      fm(type="moc", part=pnum, tags=["moc", f"part/{pnum.lower()}"])
      + f"\n\n# Part {pnum} — {ptitle}\n\n[[Home|▲ Home]]\n\n"
        f"| Section | Requirements |\n|---|---|\n" + "\n".join(rows) + "\n")

# ----------------------------------------------------------------- JSON indexes
os.makedirs(os.path.join(VAULT, "_index"), exist_ok=True)
json.dump({"document":"PLEXI-0001","version":"2.0","count":len(reqs),
           "areas":{a:AREA_NAME[a] for a in AREA_ORDER if any(reqs[r]["area"]==a for r in reqs)},
           "verification_codes":{"T":"Test","A":"Analysis","I":"Inspection","D":"Demonstration"},
           "requirements":[reqs[k] for k in sorted(reqs, key=lambda r:(AREA_ORDER.index(reqs[r]["area"]),int(r.split("-")[2])))]},
          open(f"{VAULT}/_index/requirements.json","w",encoding="utf-8"), indent=1, ensure_ascii=False)
json.dump({"invariants":[{"id":k,"statement":v,
            "services":[s for s,d in SERVICES.items() if k in d["inv"]]} for k,v in INV.items()]},
          open(f"{VAULT}/_index/invariants.json","w",encoding="utf-8"), indent=1, ensure_ascii=False)
json.dump({"risks":[{"id":k,"title":v[0],"severity":v[1],"required_by":v[2],"status":"OPEN",
            "blocks":[s for s,d in SERVICES.items() if k in d["risk"]]} for k,v in RISK.items()]},
          open(f"{VAULT}/_index/risks.json","w",encoding="utf-8"), indent=1, ensure_ascii=False)
json.dump({"services":{s:{"section":f"§{d['sec']}","owns":d["owns"],"must_not":d["notowns"],
            "store":d["store"],"emits":d["emits"],"consumes":d["consumes"],
            "requirements":sorted({*(r for r in reqs if reqs[r]["area"] in d["areas"]),*d["extra"]}),
            "slo":d["slo"],"invariants":d["inv"],"blocked_by":d["risk"]} for s,d in SERVICES.items()}},
          open(f"{VAULT}/_index/services.json","w",encoding="utf-8"), indent=1, ensure_ascii=False)

buf = io.StringIO()
cw = csv.writer(buf); cw.writerow(["id","area","domain","section","verification","derives_from","statement"])
for k in sorted(reqs, key=lambda r:(AREA_ORDER.index(reqs[r]["area"]),int(r.split("-")[2]))):
    r = reqs[k]
    cw.writerow([r["id"],r["area"],AREA_NAME[r["area"]],r["section"],r["verify"],r["src"],
                 re.sub(r"\s+"," ",re.sub(r"\*\*|`","",r["statement"]))])
open(f"{VAULT}/_index/requirements.csv","w",encoding="utf-8").write(buf.getvalue())

print(json.dumps({"sections":len(sections),"appendices":len(appendices),
                  "requirements":len(reqs),"services":len(SERVICES),"entities":len(ENTITIES),
                  "adrs":len(ADR_ORDER)}, indent=1))
