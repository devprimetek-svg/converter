"""PDF Parts Catalogue Extractor

Extracts structured parts tables from Yamaha-style PDF Parts Catalogues
using word-level coordinate clustering (via pdfplumber).
"""

from __future__ import annotations

import io
import re
from collections import Counter, defaultdict
from typing import Any, Callable, Optional, TypedDict


class ExtractionError(Exception):
    """Base error for extraction failures."""
    pass


class NoTextLayerError(ExtractionError):
    """Raised when PDF does not contain an extractable text layer (scanned)."""
    pass


class ModelColumn(TypedDict):
    name: str
    x0: float
    x1: float


class PartRow(TypedDict):
    page: int
    fig_no: str
    fig_name: str
    ref_no: str
    part_no: str
    description: str
    remarks: str
    # Plus dynamic model code columns mapped as { "MODEL": "QTY" }


class ExtractionResult(TypedDict):
    rows: list[dict]
    model_columns: list[str]
    total_pages: int
    figures: list[dict]


def clean_part_number(part_no: str) -> str:
    """Clean a Yamaha part number according to catalog rules:
    - Remove dashes (hyphens, en-dashes, em-dashes) and spaces.
    - Add '00' only if the cleaned number is exactly 10 characters long.
    - Leave 12-character (colored/painted) or other length part numbers unchanged.
    """
    if not part_no:
        return ""
    # Remove hyphens, en-dash (\u2013), em-dash (\u2014), figure dash (\u2012), and spaces
    cleaned = re.sub(r"[\s\-\u2010\u2011\u2012\u2013\u2014\u2015]", "", part_no)
    if len(cleaned) == 10:
        return cleaned + "00"
    return cleaned


def normalize_part_number(part_no: str) -> str:
    """Normalize unicode dashes in part number to standard ASCII dash."""
    if not part_no:
        return ""
    return re.sub(r"[\u2010\u2011\u2012\u2013\u2014\u2015]", "-", part_no)


def get_letter_suffix(idx: int) -> str:
    """Return 'A', 'B', ... 'Z', 'AA', 'AB' etc. for a 0-based index."""
    res = ""
    while True:
        res = chr(ord("A") + (idx % 26)) + res
        idx = idx // 26 - 1
        if idx < 0:
            break
    return res


def disambiguate_repeated_ref_numbers(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """If a ref_no is repeated within the same figure, append A, B, C, D...

    Examples:
    - If Ref 1 appears 3 times in Fig 14: becomes '1A', '1B', '1C'.
    - If Ref 2 appears 2 times: becomes '2A', '2B'.
    - If Ref 3 appears once: remains '3'.

    Scoped by figure (fig_no, or page if fig_no is not available).
    Idempotent: if a row already has a suffix like '1A' and is unique, it is preserved.
    """
    fig_groups: dict[str, list[int]] = defaultdict(list)
    for i, r in enumerate(rows):
        fig_key = str(r.get("fig_no", "")).strip()
        if not fig_key:
            fig_key = f"page_{r.get('page', 0)}"
        fig_groups[fig_key].append(i)

    for indices in fig_groups.values():
        ref_counts: Counter[str] = Counter()
        for idx in indices:
            ref = str(rows[idx].get("ref_no", "")).strip()
            if ref:
                ref_counts[ref] += 1

        seen_counts: dict[str, int] = defaultdict(int)
        for idx in indices:
            ref = str(rows[idx].get("ref_no", "")).strip()
            if ref and ref_counts[ref] > 1:
                occ_idx = seen_counts[ref]
                seen_counts[ref] += 1
                rows[idx]["ref_no"] = f"{ref}{get_letter_suffix(occ_idx)}"

    return rows



def cluster_words_into_lines(words: list[dict], tolerance: float = 2.0) -> list[list[dict]]:
    """Cluster words into physical horizontal lines by rounding/grouping their 'top' value.
    Sorts words in each line from left to right (by x0).
    """
    if not words:
        return []

    # Sort words primarily by vertical 'top' coordinate, secondarily by 'x0'
    sorted_words = sorted(words, key=lambda w: (w["top"], w["x0"]))
    lines: list[list[dict]] = []
    current_line: list[dict] = [sorted_words[0]]
    current_top = sorted_words[0]["top"]

    for word in sorted_words[1:]:
        if abs(word["top"] - current_top) <= tolerance:
            current_line.append(word)
        else:
            current_line.sort(key=lambda w: w["x0"])
            lines.append(current_line)
            current_line = [word]
            current_top = word["top"]

    if current_line:
        current_line.sort(key=lambda w: w["x0"])
        lines.append(current_line)

    # Sort lines strictly vertically by the average top of each line
    lines.sort(key=lambda line: sum(w["top"] for w in line) / len(line))
    return lines


COMMON_EXCLUDE_4CHAR = {
    "PAGE", "YEAR", "PART", "CODE", "DATE", "NAME", "UNIT", "DISC", "DRUM", "REAR",
    "CAST", "NOTE", "COPY", "BOOK", "HEAD", "PUMP", "FORK", "STOP", "TANK", "SEAT",
    "SIDE", "TUBE", "TIRE", "WHEE", "BULB", "CORD", "SHOW", "NEWS", "TYPE", "ITEM",
    "MAIN", "SEAL", "RING", "PIPE", "PLUG", "BOLT", "GEAR", "WIRE", "ROD", "LEVR",
    "TEXT", "INFO", "FORM", "FULL", "TRUE", "NONE", "NULL", "LIST", "DATA", "USER",
    "SPEC", "STEP", "DRAW", "SIZE", "MAKE", "LOGO", "FONT", "TOOL", "LOCK", "PACK",
    "ROAD", "BASE", "ONLY", "SOME", "MORE", "LESS", "HIGH", "LAST", "NEXT", "BACK",
    "DOWN", "LEFT", "FROM", "WITH", "INTO", "THEN", "ALSO", "HAVE", "THIS", "THAT",
    "WHEN", "WHAT", "EACH", "BOTH", "UR", "INDIA", "GENUINE", "MOTOR", "JAPAN", "CORP",
    "PRINTED", "REMARKS", "DESCRIPTION", "ASSY", "STUD", "COVER", "VENT", "HOSE", "FOR",
    "KITS", "BODY", "CASE", "STEM", "KICK", "LINE", "DROP", "WASH", "CLIP", "WIRE",
    "VIEW", "EDIT", "OPEN", "SAVE", "TEST", "APPR", "REMR", "MOTO", "AUTO", "OVER",
}

GENERIC_HEADER_TERMS = {
    "DESCRIPTION", "REMARKS", "REF", "PART", "NO", "QTY", "QUANTITY", "MODEL", "CODE",
    "TOTAL", "UNIT", "SERIES", "TYPE", "ITEM"
}

YAMAHA_DIGRAPHS = {
    "BG", "BJ", "BK", "B7", "B6", "BB", "BD", "1W", "2D", "34", "54", "F5", "31",
    "2P", "5T", "2N", "3J", "2F", "11", "5Y", "4S", "3C", "1S", "2B", "5D"
}


def is_valid_4char_model_code(cand: str) -> bool:
    """Check if candidate string is a strictly valid 4-character alphanumeric model code.
    Examples of valid formats:
    - All letters: BJPK, BGPK, BGPJ, BGPL
    - Letters and digit: BK2C
    - Digits and letters: 34VD, 54B1, 1WD1, 2DP1
    - Pure 4 digits: 3453
    - Letter, digits, letter: F54D
    """
    if not cand or len(cand) != 4 or not cand.isalnum():
        return False
    u = cand.upper()
    if u in COMMON_EXCLUDE_4CHAR:
        return False
    # If 4 digits, exclude publication/catalogue years (e.g. 1980 - 2035)
    if u.isdigit():
        year = int(u)
        if 1980 <= year <= 2035:
            return False
    return True


def score_model_candidate(code: str) -> float:
    """Score 4-character candidate string based on vehicle/Yamaha model code conventions."""
    if len(code) != 4:
        return -100.0
    s = 0.0
    if re.match(r"^[A-Z]{2}[0-9][A-Z]$", code):      # e.g. BK2C
        s += 25.0
    elif re.match(r"^[0-9]{2}[A-Z]{2}$", code):    # e.g. 34VD, 54B1
        s += 25.0
    elif re.match(r"^[A-Z][0-9]{2}[A-Z]$", code):    # e.g. F54D
        s += 25.0
    elif re.match(r"^[A-Z]{3}[0-9]$", code):        # e.g. BGP1
        s += 20.0
    elif re.match(r"^[0-9][A-Z]{2}[0-9]$", code):    # e.g. 1WD1
        s += 20.0
    elif re.match(r"^[A-Z]{4}$", code):              # e.g. BJPK, BGPK, BGPJ
        s += 15.0
    elif re.match(r"^[0-9]{4}$", code):              # e.g. 3453
        s += 15.0

    if code[:2] in YAMAHA_DIGRAPHS:
        s += 10.0
    if code[0] in "B12345F":
        s += 5.0
    # Heavy penalty for reverse reading artifacts
    if re.match(r"^[A-Z]{2}[0-9]{2}$", code):       # e.g. DV43
        s -= 25.0
    if re.match(r"^[0-9][A-Z]{3}$", code):          # e.g. 1PGB
        s -= 25.0
    return s


def resolve_model_code(cand: str, known_codes: Optional[list[str]] = None) -> str:
    """Resolve whether forward string or reversed string represents the true 4-character model code."""
    cand = cand.strip().upper()
    if len(cand) != 4:
        return cand
    fwd = cand
    rev = cand[::-1]

    if known_codes:
        known_set = {k.upper() for k in known_codes if is_valid_4char_model_code(k)}
        if fwd in known_set and rev not in known_set:
            return fwd
        if rev in known_set and fwd not in known_set:
            return rev
        for k in known_codes:
            ku = k.upper()
            if ku == fwd:
                return fwd
            if ku == rev:
                return rev

    s_fwd = score_model_candidate(fwd)
    s_rev = score_model_candidate(rev)
    if s_fwd > s_rev:
        return fwd
    elif s_rev > s_fwd:
        return rev
    else:
        if fwd[0] in "KJL" and rev[0] == "B":
            return rev
        return fwd


def match_partial_to_known(cand: str, known_codes: Optional[list[str]] = None) -> str:
    """Expand 3-character or trim 5-character string to known 4-character model code if matched."""
    cand = cand.strip().upper()
    if len(cand) == 4:
        return cand
    if not known_codes:
        return cand
    for k in known_codes:
        ku = k.upper()
        if not is_valid_4char_model_code(ku):
            continue
        if len(cand) == 3:
            if cand in ku or cand[::-1] in ku:
                return ku
        elif len(cand) == 5:
            if cand[:4] == ku or cand[:4][::-1] == ku:
                return ku
            if cand[1:5] == ku or cand[1:5][::-1] == ku:
                return ku
    return cand


def scan_catalog_model_codes(pdf: Any) -> list[str]:
    """Scan PDF Cover, Foreword, and sample pages to discover authoritative 4-character model codes."""
    found_codes: list[str] = []
    seen: set[str] = set()

    def add_code(c: str):
        c = c.strip().upper()
        if is_valid_4char_model_code(c) and c not in seen:
            seen.add(c)
            found_codes.append(c)

    # 1. Inspect first 5 pages (Cover, Foreword, Contents)
    for p_idx in range(min(5, len(pdf.pages))):
        text = pdf.pages[p_idx].extract_text() or ""
        # Pattern A: Parenthesized codes on cover or foreword, e.g. (BGPK), (BGPJ / BGPL), (34VD), (3453), (BK2C), (F54D), (BJPK)
        for pm in re.findall(r"\(\s*([A-Z0-9]{4}(?:\s*[/,\-]\s*[A-Z0-9]{4})*)\s*\)", text, re.I):
            for part in re.split(r"[/,\-]", pm):
                add_code(part)
        # Pattern B: Foreword Model Code declarations
        for mc in re.findall(r"(?:Model\s*Code|Column\s*Name|Q['’]?TY\s*Column)[:\s]+([A-Z0-9]{4})\b", text, re.I):
            add_code(mc)
        # Pattern C: Model code following color descriptions
        for cm in re.findall(r"\([A-Z0-9]+\)\s+([A-Z0-9]{4})\b", text):
            add_code(cm)

    # 2. Inspect remarks across first 10 pages for model references (e.g. UR FOR BGPJ, FOR 34VD)
    for p_idx in range(min(10, len(pdf.pages))):
        text = pdf.pages[p_idx].extract_text() or ""
        for rm in re.findall(r"\b(?:UR\s+)?FOR\s+([A-Z0-9]{4})\b", text, re.I):
            add_code(rm)
        for rm in re.findall(r"\bFOR\s+[A-Z0-9]+\s*\(([A-Z0-9]{4})\)", text, re.I):
            add_code(rm)

    return found_codes


def detect_vertical_model_columns(
    words: list[dict],
    header_top: float,
    header_bottom: float,
    desc_x1: float,
    remarks_x0: float,
    tolerance: float = 6.0,
    padding: float = 4.0,
    first_data_row_top: Optional[float] = None,
    known_model_codes: Optional[list[str]] = None,
) -> list[ModelColumn]:
    """Detect 4-character model-code column header(s) between DESCRIPTION and REMARKS columns.
    Enforces that every extracted model code is strictly 4 characters across all formats:
    - All letters: BJPK, BGPK, BGPJ, BGPL
    - Letters and digit: BK2C
    - Digits and letters: 34VD, 54B1, 1WD1
    - Pure 4 digits: 3453
    - Letter, digits, letter: F54D
    """
    y_min = max(0.0, header_top - 35.0)
    if first_data_row_top is not None:
        y_max = min(header_bottom + 4.0, first_data_row_top - 1.0)
    else:
        y_max = header_bottom + 4.0
    x_min = desc_x1 + 2.0
    x_max = remarks_x0 - 2.0

    candidate_words = [
        w for w in words
        if y_min <= w["top"] <= y_max and x_min <= ((w["x0"] + w["x1"]) / 2.0) <= x_max
    ]

    header_words: list[dict] = []
    for w in candidate_words:
        clean_txt = re.sub(r"[^A-Za-z0-9]", "", w["text"]).upper()
        if clean_txt in GENERIC_HEADER_TERMS:
            continue
        header_words.append(w)

    if not header_words:
        return []

    model_columns: list[ModelColumn] = []

    # 1. Single characters and multi-character fragments grouped into vertical stacks by x-coordinate
    sorted_words = sorted(header_words, key=lambda w: (w["x0"] + w["x1"]) / 2.0)
    stacks: list[list[dict]] = []
    current_stack: list[dict] = [sorted_words[0]]
    current_x = (sorted_words[0]["x0"] + sorted_words[0]["x1"]) / 2.0

    for w in sorted_words[1:]:
        mid_x = (w["x0"] + w["x1"]) / 2.0
        if abs(mid_x - current_x) <= tolerance:
            current_stack.append(w)
        else:
            stacks.append(current_stack)
            current_stack = [w]
            current_x = mid_x
    if current_stack:
        stacks.append(current_stack)

    for stack in stacks:
        stack.sort(key=lambda w: w["top"])
        cand_str = "".join(w["text"].upper() for w in stack)
        clean_cand = re.sub(r"[^A-Z0-9]", "", cand_str)

        if len(clean_cand) in (3, 5):
            clean_cand = match_partial_to_known(clean_cand, known_model_codes)

        if len(clean_cand) == 4:
            resolved_code = resolve_model_code(clean_cand, known_model_codes)
            if is_valid_4char_model_code(resolved_code):
                min_x0 = min(w["x0"] for w in stack) - padding
                max_x1 = max(w["x1"] for w in stack) + padding
                # Ensure no overlapping duplicate column
                mid_col_x = (min_x0 + max_x1) / 2.0
                if not any(abs((c["x0"] + c["x1"]) / 2.0 - mid_col_x) < tolerance for c in model_columns):
                    model_columns.append({
                        "name": resolved_code,
                        "x0": min_x0,
                        "x1": max_x1,
                    })

    # 2. Check if any standalone 4-char word exists that wasn't in a multi-word stack
    for w in header_words:
        clean_w = re.sub(r"[^A-Z0-9]", "", w["text"].upper())
        if len(clean_w) == 4:
            mid_w_x = (w["x0"] + w["x1"]) / 2.0
            if not any(c["x0"] <= mid_w_x <= c["x1"] for c in model_columns):
                resolved_w = resolve_model_code(clean_w, known_model_codes)
                if is_valid_4char_model_code(resolved_w):
                    model_columns.append({
                        "name": resolved_w,
                        "x0": w["x0"] - padding,
                        "x1": w["x1"] + padding,
                    })

    # Strictly filter: only exact 4-character valid model codes
    model_columns = [
        col for col in model_columns
        if len(col["name"]) == 4 and is_valid_4char_model_code(col["name"])
    ]
    model_columns.sort(key=lambda col: col["x0"])
    return model_columns


def extract_parts_from_pdf(
    pdf_source: io.BytesIO | bytes | str,
    progress_callback: Optional[Callable[[int, int, str, str], None]] = None,
) -> ExtractionResult:
    """Parse a Yamaha-style PDF Parts Catalogue and extract all parts rows.

    Parameters
    ----------
    pdf_source: io.BytesIO, bytes, or str file path
    progress_callback: Optional callable (current_page, total_pages, fig_no, fig_name)
    """
    import pdfplumber

    if isinstance(pdf_source, bytes):
        stream = io.BytesIO(pdf_source)
    elif isinstance(pdf_source, str):
        stream = pdf_source
    else:
        stream = pdf_source

    try:
        pdf = pdfplumber.open(stream)
    except Exception as e:
        raise ExtractionError(f"Failed to open PDF document: {e}") from e

    total_pages = len(pdf.pages)
    if total_pages == 0:
        raise ExtractionError("PDF document contains no pages.")

    # Pre-scan Cover, Foreword, and sample pages to discover authoritative 4-character model codes
    catalog_model_codes = scan_catalog_model_codes(pdf)

    all_rows: list[dict] = []
    document_model_columns: list[str] = []
    figures_seen: list[dict] = []
    seen_fig_set: set[str] = set()

    # Track state across pages (for continuation pages)
    current_fig_no: str = ""
    current_fig_name: str = ""
    last_ref_no: str = ""
    last_known_model_columns: list[ModelColumn] = []
    page_figure_map: dict[int, dict[str, str]] = {}

    total_words_extracted = 0

    try:
        for page_idx, page in enumerate(pdf.pages):
            page_num = page_idx + 1

            # Extract words with coordinates
            words = page.extract_words(use_text_flow=True, keep_blank_chars=False)
            total_words_extracted += len(words)

            # Skip empty pages
            if not words:
                if progress_callback:
                    progress_callback(page_num, total_pages, current_fig_no, current_fig_name)
                continue

            # Cluster words into physical horizontal lines
            lines = cluster_words_into_lines(words, tolerance=2.0)

            # Check for NUMERICAL INDEX — rule 8: Skip pages/sections titled "NUMERICAL INDEX" entirely
            is_numerical_index = False
            for line in lines[:5]:
                line_str = " ".join(w["text"].upper() for w in line)
                if "NUMERICAL INDEX" in line_str:
                    is_numerical_index = True
                    break
            if is_numerical_index:
                if progress_callback:
                    progress_callback(page_num, total_pages, "INDEX", "NUMERICAL INDEX")
                continue

            # Rule 3: Detect page heading matching regex ^FIG\.?\s*(\d+[A-Za-z]?)\s+(.*)$
            page_fig_no: Optional[str] = None
            page_fig_name: Optional[str] = None
            fig_line_idx: Optional[int] = None

            for idx, line in enumerate(lines[:8]):
                line_text = " ".join(w["text"] for w in line).strip()
                m = re.match(r"^FIG\.?\s*(\d+[A-Za-z]?)\s+(.*)$", line_text, re.IGNORECASE)
                if m:
                    page_fig_no = m.group(1).strip()
                    page_fig_name = m.group(2).strip()
                    fig_line_idx = idx
                    break

            # If page contains a FIG heading, update current figure state
            if page_fig_no:
                if page_fig_no != current_fig_no:
                    # New figure: reset last_ref_no
                    current_fig_no = page_fig_no
                    current_fig_name = page_fig_name
                    last_ref_no = ""
                    if current_fig_no not in seen_fig_set:
                        seen_fig_set.add(current_fig_no)
                        figures_seen.append({
                            "fig_no": current_fig_no,
                            "fig_name": current_fig_name,
                            "first_page": page_num,
                        })
                else:
                    # Same figure repeating across page break (continuation page)
                    current_fig_name = page_fig_name
            elif not current_fig_no:
                # No figure heading found and no active figure (e.g. Foreword, Cover, Contents)
                if progress_callback:
                    progress_callback(page_num, total_pages, "", "")
                continue

            # Record figure mapping for this page
            page_figure_map[page_num] = {
                "fig_no": current_fig_no,
                "fig_name": current_fig_name,
            }

            # Notify progress
            if progress_callback:
                progress_callback(page_num, total_pages, current_fig_no, current_fig_name)

            # Rule 4: Detect header row containing "DESCRIPTION" and "REMARKS"
            header_line_idx: Optional[int] = None
            desc_word: Optional[dict] = None
            remarks_word: Optional[dict] = None

            search_start_idx = (fig_line_idx + 1) if fig_line_idx is not None else 0
            for idx in range(search_start_idx, min(search_start_idx + 8, len(lines))):
                line = lines[idx]
                d_w = next((w for w in line if "DESCRIPTION" in w["text"].upper()), None)
                if d_w:
                    header_line_idx = idx
                    desc_word = d_w
                    remarks_word = next((w for w in line if "REMARKS" in w["text"].upper()), None)
                    break

            if header_line_idx is None:
                # Table header not found on this page
                continue

            desc_x1 = desc_word["x1"]
            remarks_x0 = remarks_word["x0"] if remarks_word else (page.width * 0.85)

            # Yamaha table headers span multiple physical clustered lines:
            # - Preceding lines in the header block (e.g. "REF." or top character of vertical model stack)
            # - The description line itself ("PART NO. DESCRIPTION ... REMARKS")
            # - Following lines in the header block (e.g. "NO." under "REF.", or lower characters of vertical model stack)
            header_line_indices: list[int] = []
            first_data_line_idx: Optional[int] = None

            # 1. Backwards from header_line_idx: lines containing header labels (REF, PART, NO)
            for idx in range(search_start_idx, header_line_idx):
                line = lines[idx]
                if any(w["text"].upper().rstrip(".") in {"REF", "PART", "NO"} for w in line):
                    header_line_indices.append(idx)

            # 2. The description line itself
            header_line_indices.append(header_line_idx)

            # 3. Forwards from header_line_idx: lines that are still part of the header block
            for idx in range(header_line_idx + 1, min(header_line_idx + 6, len(lines))):
                line = lines[idx]
                has_hdr_label = any(w["text"].upper().rstrip(".") in {"NO", "REF", "PART", "DESCRIPTION", "REMARKS"} for w in line)
                all_header_or_model = all(
                    w["text"].upper().rstrip(".") in {"NO", "REF", "PART", "DESCRIPTION", "REMARKS"}
                    or (desc_x1 - 10 <= (w["x0"] + w["x1"]) / 2.0 <= remarks_x0 + 10 and len(w["text"]) <= 6)
                    for w in line
                )
                if has_hdr_label or all_header_or_model:
                    header_line_indices.append(idx)
                else:
                    first_data_line_idx = idx
                    break

            if first_data_line_idx is None:
                first_data_line_idx = max(header_line_indices) + 1 if header_line_indices else header_line_idx + 1

            header_words_all = [w for idx in header_line_indices for w in lines[idx]]
            header_top = min(w["top"] for w in header_words_all)
            header_bottom = max(w["bottom"] for w in header_words_all)

            first_data_row_top = (
                min(w["top"] for w in lines[first_data_line_idx])
                if (first_data_line_idx < len(lines) and lines[first_data_line_idx])
                else None
            )

            # Rule 5: Detect vertical model columns with strictly 4-character codes
            model_columns = detect_vertical_model_columns(
                words=words,
                header_top=header_top,
                header_bottom=header_bottom,
                desc_x1=desc_x1,
                remarks_x0=remarks_x0,
                first_data_row_top=first_data_row_top,
                known_model_codes=catalog_model_codes,
            )

            if model_columns:
                last_known_model_columns = model_columns
                for col in model_columns:
                    if col["name"] not in document_model_columns:
                        document_model_columns.append(col["name"])
            elif last_known_model_columns:
                # Reuse model columns from previous figure/page if header didn't have new ones
                model_columns = last_known_model_columns
            elif catalog_model_codes:
                # Fallback for single-model catalogues with Q'TY or unlabelled quantity column
                primary_code = next((c for c in catalog_model_codes if is_valid_4char_model_code(c)), "")
                if primary_code:
                    model_columns = [{
                        "name": primary_code,
                        "x0": desc_x1 + 2.0,
                        "x1": remarks_x0 - 2.0,
                    }]
                    last_known_model_columns = model_columns
                    if primary_code not in document_model_columns:
                        document_model_columns.append(primary_code)

            # Determine column boundary between description and model columns
            if model_columns:
                first_model_x0 = min(col["x0"] for col in model_columns)
                last_model_x1 = max(col["x1"] for col in model_columns)
                remarks_boundary = remarks_x0 - 5.0
            else:
                first_model_x0 = remarks_x0 - 50.0
                last_model_x1 = remarks_x0 - 10.0
                remarks_boundary = remarks_x0 - 5.0

            # Rule 6: Process data rows below header
            data_lines = lines[first_data_line_idx:] if first_data_line_idx < len(lines) else []

            for line in data_lines:
                # Skip standalone page footer lines near the bottom
                # Rule 7: Skip standalone page-footer lines (a single centered digit near bottom)
                line_avg_top = sum(w["top"] for w in line) / len(line)
                if line_avg_top > page.height * 0.88:
                    line_text = " ".join(w["text"] for w in line).strip()
                    if re.match(r"^\d{1,4}$", line_text):
                        continue
                    # Also skip illustration figure tag codes at bottom left (e.g. B7JE470-V010, FWD)
                    if len(line) <= 2 and all(w["x1"] < page.width * 0.4 for w in line):
                        continue

                # Separate words into: model QTYs, REMARKS, and left-side words
                qty_by_model: dict[str, list[str]] = {col["name"]: [] for col in model_columns}
                remarks_words: list[str] = []
                left_words: list[dict] = []

                for w in line:
                    mid_x = (w["x0"] + w["x1"]) / 2.0

                    # Check if inside any model column's x-range
                    matched_model = False
                    for col in model_columns:
                        if col["x0"] <= mid_x <= col["x1"] or col["x0"] <= w["x0"] <= col["x1"]:
                            qty_by_model[col["name"]].append(w["text"])
                            matched_model = True
                            break

                    if matched_model:
                        continue

                    # Check if remarks
                    if w["x0"] >= remarks_boundary or mid_x >= remarks_boundary:
                        remarks_words.append(w["text"])
                    elif w["x1"] <= first_model_x0 + 5.0:
                        left_words.append(w)
                    else:
                        # Ambiguous position: if numeric, likely qty; otherwise remarks or left
                        if w["text"].isdigit() and model_columns:
                            # Assign to closest model column
                            closest_col = min(model_columns, key=lambda c: abs((c["x0"] + c["x1"])/2.0 - mid_x))
                            qty_by_model[closest_col["name"]].append(w["text"])
                        else:
                            left_words.append(w)

                if not left_words:
                    # No left side words -> not a parts data row
                    continue

                left_words.sort(key=lambda w: w["x0"])

                # Check if first word is REF NO: plain integer, optionally prefixed by "*"
                first_word_text = left_words[0]["text"].strip()
                is_ref_no = bool(re.match(r"^\*?\d{1,3}$", first_word_text))

                if is_ref_no:
                    ref_no = first_word_text
                    last_ref_no = ref_no
                    remaining_words = left_words[1:]
                else:
                    # Continuation row under the previous REF NO.
                    ref_no = last_ref_no
                    remaining_words = left_words

                if not remaining_words:
                    continue

                # First remaining left-side word is PART NO.
                raw_part_no = remaining_words[0]["text"].strip()
                part_no = normalize_part_number(raw_part_no)

                # All following left-side words joined with spaces are DESCRIPTION
                description = " ".join(w["text"] for w in remaining_words[1:]).strip()

                remarks_str = " ".join(remarks_words).strip()

                # Construct row
                row_dict: dict = {
                    "page": page_num,
                    "fig_no": current_fig_no,
                    "fig_name": current_fig_name,
                    "ref_no": ref_no,
                    "part_no": part_no,
                    "description": description,
                    "remarks": remarks_str,
                }

                # Populate model columns
                for col in model_columns:
                    qty_val = "".join(qty_by_model.get(col["name"], [])).strip()
                    row_dict[col["name"]] = qty_val

                all_rows.append(row_dict)

    finally:
        pdf.close()

    # If no words at all were extracted across all pages, text layer is absent
    if total_words_extracted == 0:
        raise NoTextLayerError(
            "This PDF has no extractable text layer (it appears to be a scanned image). "
            "OCR is not supported. Please provide a digital vector PDF catalogue."
        )

    # Ensure document_model_columns has strictly 4-character valid model codes
    if not document_model_columns and last_known_model_columns:
        document_model_columns = [col["name"] for col in last_known_model_columns]

    final_model_cols: list[str] = []
    col_name_mapping: dict[str, str] = {}
    for col_name in document_model_columns:
        resolved = resolve_model_code(col_name, catalog_model_codes)
        if is_valid_4char_model_code(resolved):
            if resolved not in final_model_cols:
                final_model_cols.append(resolved)
            if resolved != col_name:
                col_name_mapping[col_name] = resolved

    if not final_model_cols and catalog_model_codes:
        for c in catalog_model_codes:
            if is_valid_4char_model_code(c) and c not in final_model_cols:
                final_model_cols.append(c)

    if not final_model_cols:
        clean_src = str(pdf_source) if isinstance(pdf_source, str) else ""
        fn_match = re.search(r"\b([A-Z0-9]{4})\b", clean_src.upper())
        if fn_match and is_valid_4char_model_code(fn_match.group(1)):
            final_model_cols.append(fn_match.group(1))
        else:
            final_model_cols.append("MODL")

    document_model_columns = final_model_cols

    # Migrate any renamed column keys in all_rows
    if col_name_mapping:
        for row in all_rows:
            for old_k, new_k in col_name_mapping.items():
                if old_k in row:
                    row[new_k] = row.pop(old_k)

    # Fill default empty string for any model columns missing in earlier rows
    for row in all_rows:
        for model in document_model_columns:
            if model not in row:
                row[model] = ""

    # Disambiguate repeated ref_no within each figure (e.g. 1A, 1B, 2A, 2B etc.)
    all_rows = disambiguate_repeated_ref_numbers(all_rows)

    return {
        "rows": all_rows,
        "model_columns": document_model_columns,
        "total_pages": total_pages,
        "figures": figures_seen,
        "page_figure_map": page_figure_map,
    }
