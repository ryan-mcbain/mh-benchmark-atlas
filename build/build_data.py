#!/usr/bin/env python3
"""Build the data file for the Mental Health LLM Benchmark Atlas.

Run from anywhere:

    python3 build/build_data.py
    python3 build/build_data.py "data/another workbook.xlsx"

Inputs (in data/):
    *.xlsx               The supplementary workbook. It must contain a
                         benchmark sheet (name contains "Benchmark") and a
                         study sheet (name contains "stud"). If several
                         workbooks are present, the most recently modified
                         one is used unless a path is given.
    study_links.json     Paper links found by title lookup (DOI / arXiv).
    link_overrides.csv   Optional manual link corrections (always win).
                         Columns: title,url,doi,note

Outputs:
    site/assets/data/atlas-data.js   The data the website reads
    site/downloads/                  CSV and XLSX files for the Downloads page
    build/validation_report.txt      Everything the build checked

Only the Python standard library is used, so nothing needs installing.
The build stops with an error (exit code 1) if the workbook is missing
columns or if a study lists a benchmark that is not in the benchmark sheet,
so a broken workbook can never be published by accident.
"""
import csv
import datetime as dt
import glob
import json
import os
import re
import shutil
import sys
import unicodedata
import urllib.parse
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter, OrderedDict, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
SITE_DIR = os.path.join(ROOT, "site")
OUT_JS = os.path.join(SITE_DIR, "assets", "data", "atlas-data.js")
DL_DIR = os.path.join(SITE_DIR, "downloads")
REPORT_PATH = os.path.join(ROOT, "build", "validation_report.txt")

ERRORS, WARNINGS, REPORT = [], [], []


def log(line=""):
    REPORT.append(line)


def warn(msg):
    WARNINGS.append(msg)


def error(msg):
    ERRORS.append(msg)


# --------------------------------------------------------------------------
# Minimal .xlsx reader (standard library only)
# --------------------------------------------------------------------------
NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}
M = "{%s}" % NS["m"]


def _col_index(ref):
    letters = re.match(r"([A-Z]+)", ref).group(1)
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def _text_of(node):
    """Visible text of a shared/inline string (skips phonetic runs)."""
    parts = []
    t = node.find("m:t", NS)
    if t is not None:
        parts.append(t.text or "")
    for r in node.findall("m:r", NS):
        rt = r.find("m:t", NS)
        if rt is not None:
            parts.append(rt.text or "")
    return "".join(parts)


def read_xlsx(path):
    """Return (OrderedDict sheet_name -> list of rows, modified_iso)."""
    with zipfile.ZipFile(path) as z:
        names = set(z.namelist())
        shared = []
        if "xl/sharedStrings.xml" in names:
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            shared = [_text_of(si) for si in root.findall("m:si", NS)]
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        targets = {r.get("Id"): r.get("Target") for r in rels.findall("rel:Relationship", NS)}
        sheets = OrderedDict()
        for s in wb.find("m:sheets", NS).findall("m:sheet", NS):
            target = targets[s.get("{%s}id" % NS["r"])].lstrip("/")
            if not target.startswith("xl/"):
                target = "xl/" + target
            root = ET.fromstring(z.read(target))
            rows = []
            for i, row in enumerate(root.find("m:sheetData", NS).findall("m:row", NS)):
                rnum = int(row.get("r") or (len(rows) + 1))
                vals = {}
                for j, c in enumerate(row.findall("m:c", NS)):
                    idx = _col_index(c.get("r")) if c.get("r") else j
                    t = c.get("t")
                    v = c.find("m:v", NS)
                    if t == "s":
                        val = shared[int(v.text)] if v is not None else None
                    elif t == "inlineStr":
                        node = c.find("m:is", NS)
                        val = _text_of(node) if node is not None else None
                    elif t == "b":
                        val = (v.text == "1") if v is not None else None
                    elif t in ("str", "e"):
                        val = v.text if v is not None else None
                    else:
                        if v is None or v.text is None:
                            val = None
                        else:
                            f = float(v.text)
                            val = int(f) if f.is_integer() else f
                    vals[idx] = val
                while len(rows) < rnum - 1:
                    rows.append([])
                width = (max(vals) + 1) if vals else 0
                rows.append([vals.get(k) for k in range(width)])
            sheets[s.get("name")] = rows
        modified = None
        if "docProps/core.xml" in names:
            m = re.search(rb"<dcterms:modified[^>]*>([^<]+)<", z.read("docProps/core.xml"))
            if m:
                modified = m.group(1).decode()
    return sheets, modified


# --------------------------------------------------------------------------
# Cleaning helpers
# --------------------------------------------------------------------------
def clean(v):
    if v is None:
        return None
    if isinstance(v, str):
        v = unicodedata.normalize("NFC", v).replace(" ", " ").strip()
        v = re.sub(r"[ \t]+", " ", v)
        return v if v != "" else None
    return v


def split_values(s, brackets=True):
    """Split a '; '-separated cell, ignoring semicolons inside parentheses
    (and square brackets, unless brackets=False)."""
    s = clean(s)
    if s is None:
        return []
    s = str(s)
    opens, closes = ("([", ")]") if brackets else ("(", ")")
    out, depth, cur = [], 0, []
    for ch in s:
        if ch in opens:
            depth += 1
        elif ch in closes:
            depth = max(0, depth - 1)
        if ch == ";" and depth == 0:
            out.append("".join(cur).strip())
            cur = []
        else:
            cur.append(ch)
    out.append("".join(cur).strip())
    return [x for x in out if x]


def slugify(s, maxlen=64):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()
    s = re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").lower()
    s = s[:maxlen].rstrip("-")
    return s or "item"


def unique_slug(base, used):
    slug, k = base, 2
    while slug in used:
        slug = "%s-%d" % (base, k)
        k += 1
    used.add(slug)
    return slug


def norm_header(h):
    return re.sub(r"\s+", " ", str(h or "")).strip().lower()


def norm_title(t):
    t = unicodedata.normalize("NFKD", str(t or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def yes_no(v):
    v = clean(v)
    if v is None:
        return None
    if str(v).lower() in ("yes", "y", "true"):
        return True
    if str(v).lower() in ("no", "n", "false"):
        return False
    return None


def as_int(v):
    if v is None or v == "":
        return None
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


# --------------------------------------------------------------------------
# Column definitions (matched by header text, case/space-insensitive)
# --------------------------------------------------------------------------
BENCH_COLS = OrderedDict([
    ("name", "Benchmark"),
    ("named", "Named"),
    ("purpose", "Evaluation purpose"),
    ("construct", "Primary evaluation construct"),
    ("conditions", "Mental health condition or focus"),
    ("n_studies", "Studies using benchmark, No."),
    ("study_labels", "Studies using benchmark (first author, year)"),
    ("parents", "Parent benchmark(s)"),
    ("input_formats", "Input format(s)"),
    ("material", "Type of input material"),
    ("input_source", "Source of input"),
    ("conversation", "Conversation type"),
    ("languages", "Language(s)"),
    ("populations", "Population represented"),
    ("age_group", "Age group represented"),
    ("audiences", "Intended audience"),
    ("size", "Size"),
    ("availability", "Availability of inputs"),
    ("ref_types", "Reference standard type(s)"),
    ("instruments", "Validated instruments used as reference standard"),
    ("scoring", "Scoring method(s)"),
    ("judge_families", "LLM judge model family"),
    ("judge_compared", "LLM judge compared with human raters"),
    ("judge_agreement", "Judge-human agreement"),
    ("agreement_stat", "Reported agreement statistic"),
    ("lived", "Involvement of people with lived experience"),
    ("q_input", "Input quality"),
    ("q_ref", "Reference standard quality"),
    ("q_scoring", "Scoring quality"),
    ("sources", "Source documentation"),
])

STUDY_COLS = OrderedDict([
    ("first_author", "First author"),
    ("year", "Year"),
    ("title", "Title"),
    ("venue", "Source"),
    ("source_type", "Source type"),
    ("study_type", "Study type"),
    ("mh_scope", "Mental health scope"),
    ("n_benchmarks", "Benchmarks used, No."),
    ("benchmarks", "Benchmarks used"),
    ("modified", "Modified an existing benchmark"),
    ("n_models", "Models evaluated, No."),
    ("models", "Models evaluated"),
    ("model_families", "Model families evaluated"),
    ("model_access", "Model access"),
    ("variability", "Run-to-run variability"),
    ("constructs", "Primary evaluation construct(s)"),
    ("scoring", "Scoring method(s)"),
    ("llm_judge", "LLM judge used"),
])


def table_from_sheet(rows, cols, sheet_name):
    """Map header names to keys; return (records, footnotes)."""
    if not rows:
        error("Sheet '%s' is empty." % sheet_name)
        return [], []
    header = [norm_header(h) for h in rows[0]]
    index = {}
    for key, label in cols.items():
        want = norm_header(label)
        if want in header:
            index[key] = header.index(want)
        else:
            error("Sheet '%s' is missing the column '%s'." % (sheet_name, label))
    known = {norm_header(l) for l in cols.values()}
    extra = [rows[0][i] for i, h in enumerate(header) if h and h not in known]
    if extra:
        warn("Sheet '%s' has columns the website does not use yet: %s" % (sheet_name, ", ".join(map(str, extra))))
    records, notes = [], []
    for r_i, row in enumerate(rows[1:], start=2):
        cells = [clean(v) for v in row]
        filled = [v for v in cells if v not in (None, "")]
        if not filled:
            continue
        # A footnote row has a single long text cell in the first column.
        if len(filled) == 1 and cells and cells[0] and isinstance(cells[0], str) and len(cells[0]) > 120:
            notes.append(cells[0])
            continue
        rec = {"_row": r_i}
        for key, i in index.items():
            rec[key] = cells[i] if i < len(cells) else None
        records.append(rec)
    return records, notes


# --------------------------------------------------------------------------
# Field-specific parsing
# --------------------------------------------------------------------------
TIE_RE = re.compile(r"\s*\(tie across studies\)\s*$", re.I)
QUALITY_RE = re.compile(r"^(High|Adequate|Poor|NR|NA)(?:\s*\(lowest\s+(High|Adequate|Poor)\))?$", re.I)
SIZE_RE = re.compile(r"^([\d][\d,\.]*)\s*(.*?)\s*([ᵃᵇᶜᵈᵉ]*)\s*$")
SUPERSCRIPT = {"ᵃ": "a", "ᵇ": "b", "ᶜ": "c", "ᵈ": "d", "ᵉ": "e"}
COMPARATOR_RE = re.compile(r"\s*\(comparator\)\s*$", re.I)
SRC_PREFIX_RE = re.compile(r"(Cited source|Introduced in|Described in):\s*")
NONE_TOKENS = {"none", "na", "n/a", "none reported", "not applicable"}


def parse_quality(v, field, name):
    v = clean(v)
    if v is None:
        warn("%s has no %s rating." % (name, field))
        return {"r": "NA", "low": None}
    m = QUALITY_RE.match(str(v))
    if not m:
        warn("%s: unrecognized %s rating '%s'." % (name, field, v))
        return {"r": str(v), "low": None}
    r = m.group(1)
    r = r.upper() if r.upper() in ("NR", "NA") else r.capitalize()
    low = m.group(2).capitalize() if m.group(2) else None
    return {"r": r, "low": low}


def parse_size(v):
    v = clean(v)
    if v is None or str(v).lower().startswith("not reported"):
        return None
    m = SIZE_RE.match(str(v))
    if not m:
        return {"raw": str(v), "n": None, "unit": None, "note": None}
    num = m.group(1).replace(",", "")
    try:
        n = int(float(num))
    except ValueError:
        n = None
    note = "".join(SUPERSCRIPT.get(ch, "") for ch in m.group(3)) or None
    unit = m.group(2).strip() or None
    caveat = None
    if unit and unit.lower().startswith("not found"):
        caveat = "size " + unit
        unit = None
    return {"raw": str(v), "n": n, "unit": unit, "note": note, "caveat": caveat}


def size_bin(size):
    if not size or size.get("n") is None:
        return "Not reported"
    n = size["n"]
    if n < 100:
        return "Fewer than 100"
    if n < 1000:
        return "100 to 999"
    if n < 10000:
        return "1,000 to 9,999"
    return "10,000 or more"


def reuse_bin(n):
    if n <= 1:
        return "1 study"
    if n == 2:
        return "2 studies"
    if n == 3:
        return "3 studies"
    if n <= 5:
        return "4 or 5 studies"
    if n <= 9:
        return "6 to 9 studies"
    return "10 or more studies"


def models_bin(n):
    if n is None:
        return "Not reported"
    if n == 0:
        return "None"
    if n == 1:
        return "1 model"
    if n <= 3:
        return "2 or 3 models"
    if n <= 5:
        return "4 or 5 models"
    if n <= 10:
        return "6 to 10 models"
    return "More than 10 models"


def benchmarks_bin(n):
    if n is None or n <= 1:
        return "1 benchmark"
    if n == 2:
        return "2 benchmarks"
    if n <= 5:
        return "3 to 5 benchmarks"
    return "6 or more benchmarks"


def lang_scope(langs):
    if not langs or langs == ["Not reported"]:
        return "Not reported"
    if langs == ["English"]:
        return "English only"
    if "English" in langs:
        return "English and other languages"
    return "Other languages only"


def parse_sources(v):
    v = clean(v)
    if v is None:
        return []
    s = str(v)
    hits = list(SRC_PREFIX_RE.finditer(s))
    if not hits:
        return [{"kind": "Note", "text": s}]
    segs = []
    lead = s[: hits[0].start()].strip(" ;")
    if lead:
        segs.append({"kind": "Note", "text": lead})
    for i, m in enumerate(hits):
        end = hits[i + 1].start() if i + 1 < len(hits) else len(s)
        text = s[m.end(): end].strip(" ;")
        segs.append({"kind": m.group(1), "text": text})
    return segs


def list_or_empty(v):
    vals = split_values(v)
    if len(vals) == 1 and vals[0].lower() in NONE_TOKENS:
        return []
    return vals


# --------------------------------------------------------------------------
# Main build
# --------------------------------------------------------------------------
def workbook_saved_at(path):
    """The 'last saved' timestamp stored inside the workbook (git does not keep file dates)."""
    try:
        with zipfile.ZipFile(path) as z:
            m = re.search(rb"<dcterms:modified[^>]*>([^<]+)<", z.read("docProps/core.xml"))
            return m.group(1).decode() if m else ""
    except Exception:
        return ""


def pick_workbook(argv):
    if len(argv) > 1:
        path = argv[1]
        if not os.path.isabs(path):
            path = os.path.abspath(path)
        if not os.path.exists(path):
            sys.exit("Workbook not found: %s" % path)
        return path
    found = [p for p in glob.glob(os.path.join(DATA_DIR, "*.xlsx")) if not os.path.basename(p).startswith("~$")]
    if not found:
        sys.exit("No .xlsx workbook found in %s" % DATA_DIR)
    if len(found) > 1:
        found.sort(key=lambda p: (workbook_saved_at(p), os.path.basename(p)))
        warn("Several workbooks are in data/ (%s); using the most recently saved one, %s. Delete the others to avoid confusion." % (
            ", ".join(os.path.basename(p) for p in found), os.path.basename(found[-1])))
        return found[-1]
    return found[0]


def find_sheet(sheets, *needles):
    for name in sheets:
        low = name.lower()
        if all(n in low for n in needles):
            return name
    return None


def main(argv):
    wb_path = pick_workbook(argv)
    sheets, wb_modified = read_xlsx(wb_path)
    log("Mental Health LLM Benchmark Atlas: data build report")
    log("Built: %s" % dt.datetime.now().strftime("%Y-%m-%d %H:%M"))
    log("Workbook: %s" % os.path.basename(wb_path))
    log("Workbook last saved: %s" % (wb_modified or "unknown"))
    log("Sheets: %s" % ", ".join(sheets))
    log()

    b_sheet = find_sheet(sheets, "benchmark")
    s_sheet = find_sheet(sheets, "stud")
    if not b_sheet or not s_sheet:
        error("Could not find both a benchmark sheet and a study sheet (found: %s)." % ", ".join(sheets))
        return finish(None)

    braw, bnotes = table_from_sheet(sheets[b_sheet], BENCH_COLS, b_sheet)
    sraw, snotes = table_from_sheet(sheets[s_sheet], STUDY_COLS, s_sheet)
    if ERRORS:
        return finish(None)
    log("Benchmark rows: %d   Study rows: %d" % (len(braw), len(sraw)))
    log("Footnotes captured: %d (benchmarks), %d (studies)" % (len(bnotes), len(snotes)))
    log()

    # ---- Studies --------------------------------------------------------
    used = set()
    studies = []
    title_seen = {}
    for r in sraw:
        title = r["title"] or ""
        if not title:
            error("Study sheet row %d has no title." % r["_row"])
            continue
        if norm_title(title) in title_seen:
            warn("Duplicate study title (rows %d and %d): %s" % (title_seen[norm_title(title)], r["_row"], title))
        title_seen[norm_title(title)] = r["_row"]
        fa = r["first_author"] or "Unknown"
        year = as_int(r["year"])
        surname = re.sub(r"\s+et al\.?$", "", fa).strip()
        base = slugify("%s %s %s" % (surname, year or "", " ".join(re.findall(r"[A-Za-z0-9]+", title)[:4])), 70)
        sid = unique_slug(base, used)
        models, model_notes = [], []
        raw_models = clean(r["models"]) or ""
        if re.match(r"^(none|na|n/a|not applicable)\b", str(raw_models), re.I):
            inner = re.search(r"\((.+)\)", str(raw_models))
            if inner:
                model_notes.append(inner.group(1)[:1].upper() + inner.group(1)[1:])
        else:
            for m in split_values(raw_models, brackets=False):
                if m.startswith("[") or m.endswith("]"):
                    model_notes.append(m.strip("[] "))  # an abstractor's note, not a model
                    continue
                comp = bool(COMPARATOR_RE.search(m))
                models.append({"name": COMPARATOR_RE.sub("", m).strip(), "comparator": comp})
        studies.append({
            "id": sid,
            "_row": r["_row"],
            "first_author": fa,
            "label": "%s %s" % (fa, year) if year else fa,
            "year": year,
            "title": title,
            "venue": r["venue"],
            "source_type": r["source_type"],
            "study_type": r["study_type"],
            "mh_scope": r["mh_scope"],
            "_bench_names": split_values(r["benchmarks"]),
            "_n_bench_sheet": as_int(r["n_benchmarks"]),
            "modified": yes_no(r["modified"]),
            "n_models": as_int(r["n_models"]),
            "models": models,
            "model_notes": model_notes,
            "model_families": list_or_empty(r["model_families"]),
            "model_access": r["model_access"],
            "variability": r["variability"],
            "_constructs_raw": split_values(r["constructs"]),
            "scoring": split_values(r["scoring"]),
            "llm_judge": yes_no(r["llm_judge"]),
        })

    # ---- Benchmarks -----------------------------------------------------
    used = set()
    benchmarks = []
    by_name = {}
    for r in braw:
        name = r["name"]
        if not name:
            error("Benchmark sheet row %d has no name." % r["_row"])
            continue
        if name in by_name:
            error("Duplicate benchmark name '%s' (rows %d and %d)." % (name, by_name[name]["_row"], r["_row"]))
            continue
        constructs_raw = split_values(r["construct"])
        tie = any(TIE_RE.search(c) for c in constructs_raw)
        constructs = []
        for c in constructs_raw:
            c = TIE_RE.sub("", c).strip()
            if c and c not in constructs:
                constructs.append(c)
        q = {
            "input": parse_quality(r["q_input"], "input quality", name),
            "ref": parse_quality(r["q_ref"], "reference standard quality", name),
            "scoring": parse_quality(r["q_scoring"], "scoring quality", name),
        }
        size = parse_size(r["size"])
        judge_compared = clean(r["judge_compared"])
        judge_agreement = clean(r["judge_agreement"])
        stat = clean(r["agreement_stat"])
        b = {
            "id": unique_slug(slugify(name), used),
            "_row": r["_row"],
            "name": name,
            "named": yes_no(r["named"]),
            "purpose": r["purpose"],
            "constructs": constructs,
            "construct_tie": tie,
            "conditions": split_values(r["conditions"]),
            "_n_studies_sheet": as_int(r["n_studies"]),
            "_study_labels_sheet": split_values(r["study_labels"]),
            "parents": [{"name": p, "id": None} for p in list_or_empty(r["parents"])],
            "input_formats": split_values(r["input_formats"]),
            "material": split_values(r["material"]),
            "input_source": r["input_source"],
            "conversation": r["conversation"],
            "languages": split_values(r["languages"]),
            "populations": split_values(r["populations"]),
            "age_group": r["age_group"],
            "audiences": [("Not applicable" if a == "NA" else a) for a in split_values(r["audiences"])],
            "size": size,
            "size_bin": size_bin(size),
            "availability": split_values(r["availability"]),
            "ref_types": split_values(r["ref_types"]),
            "instruments": list_or_empty(r["instruments"]),
            "scoring": split_values(r["scoring"]),
            "judge_families": list_or_empty(r["judge_families"]),
            "judge_compared": None if (judge_compared or "NA") == "NA" else judge_compared,
            "judge_agreement": None if (judge_agreement or "NA") == "NA" else judge_agreement,
            "agreement_stat": None if (stat or "NA") == "NA" else split_values(stat),
            "lived": list_or_empty(r["lived"]),
            "q": q,
            "sources": parse_sources(r["sources"]),
        }
        b["lang_scope"] = lang_scope(b["languages"])
        benchmarks.append(b)
        by_name[name] = b

    # ---- Link studies <-> benchmarks ---------------------------------------
    lower_names = {n.lower(): n for n in by_name}
    b_studies = defaultdict(list)
    unmatched = []
    for s in studies:
        ids = []
        for n in s["_bench_names"]:
            key = n if n in by_name else lower_names.get(n.lower())
            if key is None:
                unmatched.append((s["label"], n))
                continue
            if key != n:
                warn("Study '%s' lists '%s'; matched to '%s' ignoring case." % (s["label"], n, key))
            bid = by_name[key]["id"]
            if bid not in ids:
                ids.append(bid)
                b_studies[bid].append(s["id"])
        s["benchmarks"] = ids
        keyed = [(m["name"].lower(), m["comparator"]) for m in s["models"]]
        dupes = sorted({k[0] for k in keyed if keyed.count(k) > 1})
        if dupes:
            warn("Study '%s' lists the same model more than once (ignoring capitalization): %s." % (s["label"], ", ".join(dupes)))
        both = sorted({k[0] for k in keyed if not k[1] and (k[0], True) in keyed})
        if both:
            warn("Study '%s' lists %d model(s) both as evaluated and as a comparator, e.g. %s." % (s["label"], len(both), ", ".join(both[:4])))
        if s["model_notes"] and s["models"]:
            warn("Study '%s': the models cell contains a note rather than only model names (shown separately): %s" % (s["label"], "; ".join(n[:80] for n in s["model_notes"])))
        if s["n_models"] is not None and s["models"] and s["n_models"] != len(s["models"]):
            warn("Study '%s': the model count column says %s, but %d %s listed." % (s["label"], s["n_models"], len(s["models"]), "model is" if len(s["models"]) == 1 else "models are"))
        if s["_n_bench_sheet"] is not None and s["_n_bench_sheet"] != len(s["_bench_names"]):
            warn("Study '%s': the count column says %s, but %d %s listed." % (s["label"], s["_n_bench_sheet"], len(s["_bench_names"]), "benchmark is" if len(s["_bench_names"]) == 1 else "benchmarks are"))
    for label, n in unmatched:
        error("Study '%s' lists benchmark '%s', which is not in the benchmark sheet." % (label, n))

    def squash(x):
        return re.sub(r"[^a-z0-9]+", "", unicodedata.normalize("NFKD", x).lower())

    squashed = {}
    for n_ in by_name:
        squashed.setdefault(squash(n_), n_)
    study_by_id = {s["id"]: s for s in studies}
    bench_by_id = {b["id"]: b for b in benchmarks}
    count_mismatch = 0
    label_notes = 0
    for b in benchmarks:
        sids = b_studies.get(b["id"], [])
        sids.sort(key=lambda i: (study_by_id[i]["year"] or 0, study_by_id[i]["first_author"]))
        b["studies"] = sids
        b["n_studies"] = len(sids)
        if b["_n_studies_sheet"] is not None and b["_n_studies_sheet"] != len(sids):
            count_mismatch += 1
            warn("Benchmark '%s': sheet says %s studies, %d studies list it." % (b["name"], b["_n_studies_sheet"], len(sids)))
        if len(sids) == 0:
            warn("Benchmark '%s' is not listed by any study." % b["name"])
        linked_labels = sorted({study_by_id[i]["label"] for i in sids})
        if linked_labels != sorted(set(b["_study_labels_sheet"])):
            label_notes += 1
            warn("Benchmark '%s': author-year list differs from the linked studies (%s vs %s)." % (
                b["name"], "; ".join(sorted(set(b["_study_labels_sheet"]))), "; ".join(linked_labels)))
        years = sorted({study_by_id[i]["year"] for i in sids if study_by_id[i]["year"]})
        b["years"] = years
        b["first_year"] = years[0] if years else None
        b["last_year"] = years[-1] if years else None
        b["reuse_bin"] = reuse_bin(len(sids))
        # Parent benchmarks that are themselves in the data become links.
        for p in b["parents"]:
            key = p["name"] if p["name"] in by_name else lower_names.get(p["name"].lower())
            if not key:
                key = squashed.get(squash(p["name"]))
                if key:
                    warn("Benchmark '%s' lists parent '%s'; linked to '%s'. Consider using the exact name." % (b["name"], p["name"], key))
            if key:
                p["id"] = by_name[key]["id"]
        # "Introduced in" / "Described in" labels -> the matching studies.
        for seg in b["sources"]:
            seg["study_ids"] = []
            if seg["kind"] in ("Introduced in", "Described in"):
                for lab in split_values(seg["text"]):
                    hits = [i for i in sids if study_by_id[i]["label"] == lab]
                    seg["study_ids"].extend(h for h in hits if h not in seg["study_ids"])
        q = b["q"]
        ratings = [q["input"]["r"], q["ref"]["r"], q["scoring"]["r"]]
        b["flags"] = {
            "high_all3": all(x == "High" for x in ratings),
            # As in the review's summary statistics, a reference standard
            # rated NR (not reported) counts as Poor.
            "any_poor": any(x == "Poor" for x in ratings) or q["ref"]["r"] == "NR",
            "llm_judge": bool(b["judge_families"]) or "LLM ratings or preferences" in b["scoring"],
            "validated_instrument": bool(b["instruments"]),
            "lived_experience": bool(b["lived"]),
            "derived": bool(b["parents"]),
        }

    # ---- Harmonize study constructs to the benchmark vocabulary ------------
    bench_constructs = {c for b in benchmarks for c in b["constructs"]}
    alias_used = Counter()

    def harmonize(c):
        c0 = TIE_RE.sub("", c).strip()
        if c0 in bench_constructs:
            return c0
        cands = []
        m = re.match(r"^Other \((.+)\)$", c0)
        if m:
            inner = m.group(1).strip()
            cands.append(inner[:1].upper() + inner[1:])
        cands.append(re.sub(r"\s*/\s*", " or ", c0))
        for cand in cands:
            for bc in bench_constructs:
                if bc.lower() == cand.lower():
                    alias_used[(c0, bc)] += 1
                    return bc
        return c0

    for s in studies:
        out = []
        for c in s["_constructs_raw"]:
            h = harmonize(c)
            if h not in out:
                out.append(h)
        s["constructs"] = out
        # Characteristics inherited from the benchmarks a study used.
        purposes, conditions = [], []
        for bid in s["benchmarks"]:
            b = bench_by_id[bid]
            if b["purpose"] and b["purpose"] not in purposes:
                purposes.append(b["purpose"])
            for c in b["conditions"]:
                if c not in conditions:
                    conditions.append(c)
        s["bench_purposes"] = purposes
        s["bench_conditions"] = conditions
        s["models_bin"] = models_bin(s["n_models"])
        s["benchmarks_bin"] = benchmarks_bin(len(s["benchmarks"]))

    # ---- Paper links ----------------------------------------------------
    links = {}
    lpath = os.path.join(DATA_DIR, "study_links.json")
    if os.path.exists(lpath):
        with open(lpath, encoding="utf-8") as fh:
            for row in json.load(fh):
                links[norm_title(row.get("title"))] = row
    else:
        warn("data/study_links.json not found; studies will link to a title search.")
    overrides = {}
    opath = os.path.join(DATA_DIR, "link_overrides.csv")
    if os.path.exists(opath):
        with open(opath, encoding="utf-8-sig", newline="") as fh:
            for row in csv.DictReader(fh):
                t = (row.get("title") or "").strip()
                if t and (row.get("url") or "").strip():
                    overrides[norm_title(t)] = row
    link_stats = Counter()
    unused_links = set(links) - {norm_title(s["title"]) for s in studies}
    for s in studies:
        key = norm_title(s["title"])
        search_url = "https://scholar.google.com/scholar?q=" + urllib.parse.quote('"%s"' % s["title"])
        link = {"url": search_url, "kind": "search", "doi": None, "arxiv": None, "verified": False}
        if key in overrides:
            o = overrides[key]
            url = o["url"].strip()
            ax = re.search(r"arxiv\.org/(?:abs|html|pdf)/(\d{4}\.\d{4,5})", url)
            link = {"url": url, "kind": "arxiv" if "arxiv.org" in url else ("doi" if "doi.org" in url else "web"),
                    "doi": (o.get("doi") or "").strip().lower() or None, "arxiv": ax.group(1) if ax else None,
                    "verified": True, "manual": True}
            link_stats["manual override"] += 1
        elif key in links and links[key].get("confidence") == "high" and links[key].get("url"):
            L = links[key]
            url = L["url"]
            link = {"url": url, "kind": "arxiv" if "arxiv.org" in url else "doi",
                    "doi": L.get("doi"), "arxiv": L.get("arxiv_id"), "verified": True}
            link_stats["verified lookup"] += 1
        elif key in links:
            link_stats["title search (lookup %s)" % links[key].get("confidence")] += 1
        else:
            link_stats["title search (not looked up)"] += 1
        s["link"] = link

    # ---- Report ---------------------------------------------------------
    log("LINKS BETWEEN SHEETS")
    log("  Studies listing a benchmark that is not in the benchmark sheet: %d" % len(unmatched))
    log("  Benchmarks whose study count differs from the linked studies: %d" % count_mismatch)
    log("  Benchmarks whose author-year list differs (usually two studies share a label): %d" % label_notes)
    log()
    log("PAPER LINKS")
    for k, v in sorted(link_stats.items()):
        log("  %-34s %d" % (k, v))
    if unused_links:
        log("  Links file has %d titles that are not in the workbook (ignored)." % len(unused_links))
    log()
    log("CONSTRUCT LABELS HARMONIZED (study sheet -> benchmark sheet)")
    for (a, b), n in sorted(alias_used.items()):
        log("  %s  ->  %s   (%d)" % (a, b, n))
    log()

    def vocab(items, key, top=None):
        c = Counter()
        for it in items:
            v = it[key]
            for x in (v if isinstance(v, list) else [v]):
                c[x] += 1
        return c

    log("VOCABULARIES (check for typos or near-duplicates)")
    for key in ["purpose", "constructs", "conditions", "input_formats", "material", "input_source", "conversation",
                "languages", "lang_scope", "populations", "age_group", "audiences", "size_bin", "availability",
                "ref_types", "scoring", "judge_families", "judge_compared", "judge_agreement", "lived", "reuse_bin"]:
        c = vocab(benchmarks, key)
        log("  Benchmarks / %s:" % key)
        for v, n in c.most_common():
            log("      %4d  %s" % (n, v))
    for key in ["year", "source_type", "study_type", "mh_scope", "model_families", "model_access", "variability",
                "constructs", "scoring", "models_bin", "benchmarks_bin"]:
        c = vocab(studies, key)
        log("  Studies / %s:" % key)
        for v, n in c.most_common():
            log("      %4d  %s" % (n, v))
    qc = Counter()
    for b in benchmarks:
        for dim in ("input", "ref", "scoring"):
            qc[(dim, b["q"][dim]["r"])] += 1
    log()
    log("QUALITY (modal rating across studies)")
    for dim in ("input", "ref", "scoring"):
        log("  %-8s %s" % (dim, ", ".join("%s %d" % (r, qc[(dim, r)]) for r in ("High", "Adequate", "Poor", "NR", "NA"))))
    log("  High on all three: %d" % sum(b["flags"]["high_all3"] for b in benchmarks))
    log("  Poor on at least one (NR reference standard counted as Poor): %d" % sum(b["flags"]["any_poor"] for b in benchmarks))
    odd_sizes = [b["size"]["raw"] for b in benchmarks if b["size"] and (b["size"]["n"] is None or not b["size"]["unit"])]
    if odd_sizes:
        log("  Sizes that could not be fully parsed: %s" % "; ".join(odd_sizes))

    # ---- Output ---------------------------------------------------------
    if ERRORS:
        return finish(None)  # never publish data that failed validation
    for coll in (benchmarks, studies):
        for it in coll:
            for k in [k for k in it if k.startswith("_")]:
                del it[k]

    meta = {
        "title": "Mental Health LLM Benchmark Atlas",
        "workbook": os.path.basename(wb_path),
        "workbook_modified": wb_modified,
        "built": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "counts": {"benchmarks": len(benchmarks), "studies": len(studies)},
        "notes": {"benchmarks": bnotes, "studies": snotes},
    }
    payload = {"meta": meta, "benchmarks": benchmarks, "studies": studies}
    os.makedirs(os.path.dirname(OUT_JS), exist_ok=True)
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    with open(OUT_JS, "w", encoding="utf-8") as fh:
        fh.write("/* Generated by build/build_data.py from %s. Do not edit by hand. */\n" % meta["workbook"])
        fh.write("window.ATLAS_DATA = ")
        fh.write(body)
        fh.write(";\n")
    write_downloads(wb_path, benchmarks, studies, study_by_id, bench_by_id)
    log()
    log("Wrote %s (%.0f KB)" % (os.path.relpath(OUT_JS, ROOT), os.path.getsize(OUT_JS) / 1024))
    return finish(payload)


def write_downloads(wb_path, benchmarks, studies, study_by_id, bench_by_id):
    os.makedirs(DL_DIR, exist_ok=True)
    J = "; ".join
    site = os.environ.get("ATLAS_SITE_URL", "").rstrip("/")
    base = (site + "/") if site else "index.html"

    def link(page, prefix, id_):
        return base + "#/" + page + "?show=" + prefix + "%3A" + id_
    with open(os.path.join(DL_DIR, "benchmarks.csv"), "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["Benchmark", "Named", "Evaluation purpose", "Primary evaluation construct",
                    "Mental health condition or focus", "Studies using benchmark, No.", "Studies using benchmark",
                    "First year used", "Most recent year used", "Parent benchmark(s)", "Input format(s)",
                    "Type of input material", "Source of input", "Conversation type", "Language(s)",
                    "Population represented", "Age group represented", "Intended audience", "Size",
                    "Availability of inputs", "Reference standard type(s)",
                    "Validated instruments used as reference standard", "Scoring method(s)",
                    "LLM judge model family", "LLM judge compared with human raters", "Judge-human agreement",
                    "Reported agreement statistic", "Involvement of people with lived experience",
                    "Input quality", "Reference standard quality", "Scoring quality", "Source documentation",
                    "Atlas link"])
        for b in benchmarks:
            def qtext(d):
                return d["r"] + (" (lowest %s)" % d["low"] if d["low"] else "")
            w.writerow([
                b["name"], "Yes" if b["named"] else "No", b["purpose"],
                J(b["constructs"]) + (" (tie across studies)" if b["construct_tie"] else ""),
                J(b["conditions"]), b["n_studies"],
                J("%s, %s" % (study_by_id[i]["label"], study_by_id[i]["title"]) for i in b["studies"]),
                b["first_year"], b["last_year"], J(p["name"] for p in b["parents"]) or "None",
                J(b["input_formats"]), J(b["material"]), b["input_source"], b["conversation"],
                J(b["languages"]), J(b["populations"]), b["age_group"], J(b["audiences"]),
                b["size"]["raw"] if b["size"] else "Not reported", J(b["availability"]), J(b["ref_types"]),
                J(b["instruments"]) or "None", J(b["scoring"]), J(b["judge_families"]) or "NA",
                b["judge_compared"] or "NA", b["judge_agreement"] or "NA", J(b["agreement_stat"] or []) or "NA",
                J(b["lived"]) or "None reported", qtext(b["q"]["input"]), qtext(b["q"]["ref"]),
                qtext(b["q"]["scoring"]), J("%s: %s" % (s["kind"], s["text"]) if s["kind"] != "Note" else s["text"] for s in b["sources"]),
                link("benchmarks", "b", b["id"]),
            ])
    with open(os.path.join(DL_DIR, "studies.csv"), "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["First author", "Year", "Title", "Source", "Source type", "Study type", "Mental health scope",
                    "Benchmarks used, No.", "Benchmarks used", "Modified an existing benchmark",
                    "Models evaluated, No.", "Models evaluated", "Model families evaluated", "Model access",
                    "Run-to-run variability", "Primary evaluation construct(s)", "Scoring method(s)",
                    "LLM judge used", "Paper link", "Link verified", "DOI", "Atlas link"])
        for s in studies:
            w.writerow([
                s["first_author"], s["year"], s["title"], s["venue"], s["source_type"], s["study_type"],
                s["mh_scope"], len(s["benchmarks"]), J(bench_by_id[i]["name"] for i in s["benchmarks"]),
                "Yes" if s["modified"] else "No", s["n_models"],
                J(m["name"] + (" (comparator)" if m["comparator"] else "") for m in s["models"]),
                J(s["model_families"]) or "NA", s["model_access"], s["variability"], J(s["constructs"]),
                J(s["scoring"]), "Yes" if s["llm_judge"] else "No", s["link"]["url"],
                "Yes" if s["link"]["verified"] else "No (title search)", s["link"]["doi"] or "",
                link("studies", "s", s["id"]),
            ])
    shutil.copyfile(wb_path, os.path.join(DL_DIR, "atlas-workbook.xlsx"))


def finish(payload):
    if WARNINGS:
        log()
        log("WARNINGS (%d)" % len(WARNINGS))
        for w in WARNINGS:
            log("  - " + w)
    if ERRORS:
        log()
        log("ERRORS (%d) - the data file was NOT updated" % len(ERRORS))
        for e in ERRORS:
            log("  - " + e)
    os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)
    with open(REPORT_PATH, "w", encoding="utf-8") as fh:
        fh.write("\n".join(REPORT) + "\n")
    if ERRORS:
        print("Build FAILED with %d error(s). See %s" % (len(ERRORS), os.path.relpath(REPORT_PATH, ROOT)))
        for e in ERRORS[:20]:
            print("  - " + e)
        return 1
    c = payload["meta"]["counts"]
    print("Build OK: %d benchmarks, %d studies, %d warning(s). Report: %s" % (
        c["benchmarks"], c["studies"], len(WARNINGS), os.path.relpath(REPORT_PATH, ROOT)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
