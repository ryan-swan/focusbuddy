#!/usr/bin/env python3
"""Regenerate the single-file edition from the vault, so the circulation copy
never drifts from the source of truth."""
import os, re, glob

VAULT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT   = os.path.join(VAULT, "PLEXI-0001-v2.0.md")
ORDER = ["00-meta","01-vision","02-product-model","03-user-experience","04-domain-model",
         "05-platform-architecture","06-data-apis-security","07-applications-agents-roadmap"]

def clean(t):
    t = re.sub(r"\A---\n.*?\n---\n", "", t, flags=re.S)
    t = re.sub(r"^(◀|▲).*$", "", t, flags=re.M)
    t = re.sub(r"^\[\[Home.*$", "", t, flags=re.M)
    t = re.sub(r"^.*\|▲ Part [IVX0]+\]\].*$", "", t, flags=re.M)
    t = re.sub(r"\n## Requirements defined or cited here\n.*?(?=\n---|\Z)", "", t, flags=re.S)
    t = re.sub(r"\[\[[^\]|]+\\?\|([^\]]+)\]\]", r"\1", t)
    t = re.sub(r"\[\[([^\]]+)\]\]", r"\1", t)
    return re.sub(r"\n{3,}", "\n\n", t).strip()

parts = []
_fm = os.path.join(VAULT, "00-meta", "_Front Matter.md")
if os.path.exists(_fm):
    parts.append(clean(open(_fm, encoding="utf-8").read()))
for d in ORDER:
    moc = glob.glob(os.path.join(VAULT, d, "Part *.md"))
    if moc:
        parts.append("# " + os.path.basename(moc[0])[:-3])
    for f in sorted(glob.glob(os.path.join(VAULT, d, "S[0-9]*.md")),
                    key=lambda p: int(re.search(r"S(\d+)", os.path.basename(p)).group(1))):
        parts.append(clean(open(f, encoding="utf-8").read()))
for a in sorted(glob.glob(os.path.join(VAULT, "registers", "Appendix *.md"))):
    parts.append(clean(open(a, encoding="utf-8").read()))

open(OUT, "w", encoding="utf-8").write("\n\n---\n\n".join(parts) + "\n")
print(f"wrote {OUT} ({len(open(OUT, encoding='utf-8').read().split()):,} words)")
