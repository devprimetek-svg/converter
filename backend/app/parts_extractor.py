"""PDF Parts Catalogue Extractor

Extracts structured parts tables from Yamaha-style PDF Parts Catalogues
using word-level coordinate clustering (via pdfplumber).
"""

from __future__ import annotations

import io
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
from collections import Counter, defaultdict
from typing import Any, Callable, Optional, TypedDict

from PIL import Image

logger = logging.getLogger("parts_extractor")


def find_tesseract_binary() -> Optional[str]:
    """Locate tesseract executable on Windows or system PATH."""
    candidates = [
        os.path.join(getattr(sys, "_MEIPASS", ""), "tesseract", "tesseract.exe") if getattr(sys, "_MEIPASS", None) else "",
        os.path.join(os.path.dirname(os.path.abspath(sys.executable)), "tesseract", "tesseract.exe") if getattr(sys, "frozen", False) else "",
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe"),
        os.path.expandvars(r"%ProgramFiles%\Tesseract-OCR\tesseract.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Tesseract-OCR\tesseract.exe"),
    ]
    for c in candidates:
        if c and os.path.exists(c):
            return c
    return shutil.which("tesseract")


def parse_tesseract_tsv(tsv_output: str, scale_factor: float = 1.0) -> list[dict[str, Any]]:
    """Parse Tesseract TSV output into pdfplumber-compatible word dicts."""
    words: list[dict[str, Any]] = []
    lines = tsv_output.strip().splitlines()
    if len(lines) <= 1:
        return words
    header = lines[0].split("\t")
    scale = scale_factor if scale_factor > 0 else 1.0

    for line in lines[1:]:
        parts = line.split("\t")
        if len(parts) != len(header):
            continue
        row = dict(zip(header, parts))
        text = row.get("text", "").strip()
        try:
            conf = float(row.get("conf", -1))
        except Exception:
            conf = -1.0
        if text and conf > 20.0:
            try:
                left = float(row.get("left", 0)) / scale
                top = float(row.get("top", 0)) / scale
                width = float(row.get("width", 0)) / scale
                height = float(row.get("height", 0)) / scale
                words.append({
                    "text": text,
                    "x0": left,
                    "top": top,
                    "x1": left + width,
                    "bottom": top + height,
                    "upright": True,
                })
            except Exception:
                pass
    return words


def ocr_page_with_tesseract(
    page_image: Image.Image,
    tesseract_cmd: str,
    scale_factor: float = 1.0,
    psm: str = "3",
) -> list[dict[str, Any]]:
    """Execute Tesseract OCR on a rendered page image in an isolated subprocess (crash-proof)."""
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        page_image.save(tmp_path, format="PNG")
        startupinfo = None
        if os.name == "nt":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = 0  # SW_HIDE
        cmd = [tesseract_cmd, tmp_path, "stdout", "--psm", psm, "tsv"]
        proc = subprocess.run(
            cmd,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            encoding="utf-8",
            errors="replace",
            startupinfo=startupinfo,
            timeout=30.0,
            check=False,
        )
        if proc.returncode != 0:
            logger.warning("Tesseract OCR returned code %d", proc.returncode)
            return []
        return parse_tesseract_tsv(proc.stdout, scale_factor=scale_factor)
    except Exception as e:
        logger.error("OCR execution error: %s", e)
        return []
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass


def detect_scanned_doc_rotation(pdfium_doc: Any, tesseract_cmd: str) -> int:
    """Detect orientation angle (0, 90, 180, 270) for scanned PDF documents.
    Scores occurrences of catalogue figure headings, catalogue titles, and parts keywords.
    """
    KEY_WORDS = {
        "YAMAHA", "PARTS", "CATALOGUE", "CATALOG", "FIG", "CYLINDER",
        "DESCRIPTION", "REMARKS", "PART", "REF", "MODEL", "HEAD",
        "CRANKSHAFT", "VALVE", "COVER", "ASSY"
    }
    candidate_pages: list[int] = []
    if len(pdfium_doc) > 6:
        candidate_pages.append(6)
    candidate_pages.append(0)

    for p_idx in candidate_pages:
        try:
            img = pdfium_doc[p_idx].render(scale=1.5).to_pil()
            scores: dict[int, int] = {}
            for angle in (0, 90, 180, 270):
                rot_img = img if angle == 0 else img.rotate(angle, expand=True)
                words = ocr_page_with_tesseract(rot_img, tesseract_cmd, scale_factor=1.5, psm="3")
                lines = cluster_words_into_lines(words, tolerance=2.0)
                text = " ".join(w["text"].upper() for w in words)
                score = sum(1 for kw in KEY_WORDS if kw in text)
                # Primary indicator: page contains a figure heading like "FIG. 1 CYLINDER HEAD"
                if any(re.match(r"^(?:FIG\.?|FIGURE)\s*(\d+[A-Za-z]?)\s+", " ".join(w["text"] for w in l), re.IGNORECASE) for l in lines[:8]):
                    score += 15
                if "PARTS CATALOGUE" in text or "PARTS CATALOG" in text:
                    score += 10
                scores[angle] = score

            if scores[0] >= 15:
                return 0

            best_angle = max(scores, key=lambda a: scores[a])
            if scores[best_angle] >= 10:
                return best_angle
        except Exception as e:
            logger.debug("Rotation detection failed on page %d: %s", p_idx, e)
    return 0


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


def build_catalogue_code(model_code: str, fig_name: str, fig_no: str = "") -> str:
    """Build standardized catalogue code for a figure/assembly parent cell.
    Format: YAM_{MODEL_CODE}_{PARTS NAME} with space between words of parts name.
    e.g. YAM_BGPK_CYLINDER HEAD
    """
    mc = re.sub(r'[^A-Za-z0-9]+', '_', (model_code or "").strip()).strip('_').upper()
    if not mc:
        mc = "MODEL"
    # User rule: between words of parts name inside catalogue code, use space instead of underscore, preserve '&'
    fn = re.sub(r'[^A-Za-z0-9&]+', ' ', (fig_name or "").strip()).strip().upper()
    if not fn:
        if fig_no:
            padded = str(fig_no).zfill(2) if str(fig_no).isdigit() else str(fig_no)
            fn = f"FIG {padded}"
        else:
            fn = "PARTS"
    return f"YAM_{mc}_{fn}"


def build_image_record(model_code: str, fig_name: str, fig_no: str = "") -> str:
    """Build standardized parent image filename record.
    Matches naming standard: YAM_{MODEL_CODE}_{PARTS NAME}.jpeg
    e.g. YAM_BGPK_CYLINDER HEAD.jpeg
    """
    cat_code = build_catalogue_code(model_code, fig_name, fig_no)
    return f"{cat_code}.jpeg" if cat_code else ""


def extract_model_info_from_pdf(pdf, raw_bytes: Optional[bytes] = None) -> tuple[str, str]:
    """Scan the first few pages of an open pdfplumber PDF to detect the model name and primary
    model code printed on the cover / foreword page.

    Returns
    -------
    (model_name, model_code) — e.g. ("LCX125", "BGPJ")
    If not detected, returns ("", "").

    The cover page commonly contains a line such as:
        LCX125 (BGPJ / BGPL) INDIA
        R15 V4 (BJPK) INDIA
        YZF-R15 (B7W2 / B7W4) INDIA
        D2J1 [EC-06]
        MODEL CODE: D2J1 [EC-06]
    """
    stop_words = {"PARTS", "CATALOGUE", "CATALOG", "YAMAHA", "GENUINE", "FOREWORD",
                  "CONTENTS", "INDEX", "ACCESSORIES", "INDIA", "SERIES", "SUMMARY"}
    tess_cmd: Optional[str] = None
    pdfium_doc = None
    detected_rot: int = 0
    all_pages_text: list[str] = []
    try:
        for page_idx in range(min(4, len(pdf.pages))):
            try:
                text = pdf.pages[page_idx].extract_text() or ""
            except Exception:
                text = ""

            if not text.strip() and raw_bytes:
                if tess_cmd is None:
                    tess_cmd = find_tesseract_binary() or ""
                if tess_cmd:
                    try:
                        if pdfium_doc is None:
                            import pypdfium2
                            pdfium_doc = pypdfium2.PdfDocument(raw_bytes)
                            detected_rot = detect_scanned_doc_rotation(pdfium_doc, tess_cmd)
                        if page_idx < len(pdfium_doc):
                            img = pdfium_doc[page_idx].render(scale=2.0).to_pil()
                            if detected_rot != 0:
                                img = img.rotate(detected_rot, expand=True)
                            ocr_words = ocr_page_with_tesseract(img, tess_cmd, scale_factor=2.0, psm="3")
                            if ocr_words:
                                text = " ".join(w["text"] for w in ocr_words)
                    except Exception as e:
                        logger.debug("Cover page OCR failed on page %d: %s", page_idx, e)

            all_pages_text.append(text)

        combined_cover_text = "\n".join(all_pages_text)

        # 1. First pass: explicit MODEL CODE and MODEL NAME check (e.g. D2J1 on page 1)
        m_exp_code = re.search(r"MODEL\s+CODE\s*:\s*([A-Za-z0-9\-]+)(?:\s*\[([^\]]+)\]|\s*\(([^\)]+)\))?", combined_cover_text, re.IGNORECASE)
        m_exp_name = re.search(r"MODEL\s+NAME\s*:\s*([A-Za-z0-9\-\s]+)", combined_cover_text, re.IGNORECASE)
        if m_exp_code:
            c_code = m_exp_code.group(1).strip().upper()
            c_bracket = (m_exp_code.group(2) or m_exp_code.group(3) or "").strip()
            c_name = m_exp_name.group(1).strip() if m_exp_name else ""
            res_name = c_bracket if c_bracket else (c_name or c_code)
            return res_name, c_code

        # 2. Second pass: scan lines for <NAME> [ <CODE> ] or <NAME> ( <CODE> )
        for raw_line in combined_cover_text.splitlines():
            line = raw_line.strip()
            m_br = re.search(
                r"([A-Za-z0-9](?:[A-Za-z0-9\-\.\+\s]*?[A-Za-z0-9])?)\s*\[\s*([A-Z0-9][A-Za-z0-9\-]+(?:\s*[/,\s]\s*[A-Z0-9][A-Za-z0-9\-]+)*)\s*\]",
                line,
            )
            m_pr = re.search(
                r"([A-Za-z0-9](?:[A-Za-z0-9\-\.\+\s]*?[A-Za-z0-9])?)\s*\(\s*([A-Z0-9][A-Za-z0-9\-]+(?:\s*[/,\s]\s*[A-Z0-9][A-Za-z0-9\-]+)*)\s*\)",
                line,
            )
            m = m_br or m_pr
            if not m:
                continue
            cand_name = m.group(1).strip()
            codes_raw = m.group(2)
            codes = [c.strip().upper() for c in re.split(r"[/,\s]+", codes_raw) if c.strip()]

            # Strip leading stop words & symbols (e.g. "@ YAMAHA PARTS CATALOGUE LCX1 25D" -> "LCX1 25D")
            cand_name = re.sub(r"^(?:[@\|\:\s\-_]*(?:YAMAHA|PARTS|CATALOGUE|CATALOG|GENUINE)\b\s*)+", "", cand_name, flags=re.IGNORECASE).strip()

            # Merge split digits from OCR spacing (e.g. "LCX1 25D" -> "LCX125D", "MTN1 55-A" -> "MTN155-A")
            cand_name = re.sub(r"(\d)\s+(\d)", r"\1\2", cand_name)

            # Reject if candidate name is entirely a stop-word or too short
            name_clean = re.sub(r"\s+", " ", cand_name).strip().upper()
            if not name_clean or name_clean in stop_words or len(name_clean) < 2:
                continue
            # Reject if name is just the model code itself (4-char alphanum codes)
            if re.fullmatch(r"[A-Z0-9]{3,8}", name_clean) and codes and name_clean in codes:
                continue
            if codes:
                return cand_name.strip(), codes[0]
    finally:
        if pdfium_doc is not None:
            try:
                pdfium_doc.close()
            except Exception:
                pass
    return "", ""


def build_model_name_record(model_code: str, model_name: str, fig_name: str) -> str:
    """Build the formatted model name record for a parent parts row.
    Format: YAMAHA {MODEL_CODE} {MODEL_NAME} Series {PARTS_NAME}
    e.g.    YAMAHA BJPK FASCINO 125CC DISK Series CYLINDER
    or      YAMAHA BGPJ LCX125 Series CYLINDER HEAD

    Rules:
    - MODEL_CODE is uppercased
    - MODEL_NAME kept clean and stripped without quotes
    - PARTS_NAME is the fig_name uppercased with extra spaces normalised
    - If model_name is blank or identical to model_code, omit it: YAMAHA {MODEL_CODE} Series {PARTS_NAME}
    - If model_code is also blank, use MODEL as fallback
    """
    mc = (model_code or "MODEL").strip().upper()
    mn = (model_name or "").strip()
    fn = re.sub(r"\s+", " ", (fig_name or "").strip()).upper()
    if not fn:
        fn = "PARTS"
    if mn:
        clean_mn = mn.strip('"\'').strip()
        if clean_mn.upper() != mc:
            return f"YAMAHA {mc} {clean_mn} Series {fn}"
    return f"YAMAHA {mc} Series {fn}"


def clean_description(desc: str) -> str:
    """Clean the description text extracted from catalog tables.
    Rule: Do not extract (.) (-) (_) (,) characters.
    Also strips unicode hyphens/dashes and normalizes multiple spaces.
    """
    if not desc:
        return ""
    # Strip dots (.), hyphens/dashes (- and unicode dashes), underscores (_), and commas (,)
    cleaned = re.sub(r"[.\-_,\u2010\u2011\u2012\u2013\u2014\u2015]", " ", str(desc))
    # Normalize multiple whitespace into single space
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def clean_part_number(part_no: str) -> str:
    """Clean a Yamaha part number according to catalog rules:
    - Remove dashes (hyphens, en-dashes, em-dashes), dots, and spaces.
    - If exactly 10 characters, add '00' to make it 12 characters.
    - If exactly 12 characters, leave it as 12 characters.
    - If more than 12 characters, keep it at 12 characters (truncate to 12).
    """
    if not part_no:
        return ""
    # Remove hyphens, en-dash (\u2013), em-dash (\u2014), figure dash (\u2012), dots, and spaces
    cleaned = re.sub(r"[\s\-\.\u2010\u2011\u2012\u2013\u2014\u2015]", "", str(part_no))
    if len(cleaned) == 10:
        return cleaned + "00"
    elif len(cleaned) > 12:
        return cleaned[:12]
    return cleaned


def normalize_part_number(part_no: str) -> str:
    """Normalize unicode dashes in part number to standard ASCII dash and enforce catalog rules:
    - Dot (.) must never be extracted in part number (remove all dots).
    - Strip trailing and leading punctuation/spaces.
    - If part number has 10 characters, add '00' to make it 12 characters.
    - If part number has 12 characters, keep as 12 characters.
    - If unhyphenated part number has more than 12 characters, keep at 12 characters (truncate to 12).
    """
    if not part_no:
        return ""
    cleaned = re.sub(r"[\u2010\u2011\u2012\u2013\u2014\u2015]", "-", str(part_no))
    # Strip dots (.) completely from part number
    cleaned = cleaned.replace(".", "")
    cleaned = cleaned.strip(" ,.;:-_")

    if len(cleaned) == 10:
        cleaned = cleaned + "00"
    elif len(cleaned) > 12 and "-" not in cleaned:
        cleaned = cleaned[:12]
    return cleaned


def clean_remarks(remarks: str) -> str:
    """Clean the remarks text extracted from catalog tables.
    Do not extract words like UR, AB, YB (case-insensitive standalone tokens).
    Also strips orphaned punctuation (commas, slashes, dashes, parentheses) and extra whitespace.
    """
    if not remarks:
        return ""

    # Remove standalone UR, AB, YB tokens (case-insensitive)
    # \b matches word boundaries so words like TURBO, CABLE, ABOUT, FOUR are preserved
    cleaned = re.sub(r"\b(UR|AB|YB)\b", "", str(remarks), flags=re.IGNORECASE)

    # Remove empty parentheses e.g. () or ( )
    cleaned = re.sub(r"\(\s*\)", "", cleaned)

    # Clean up repetitive or orphaned separators like ", ,", "/ /", "--"
    cleaned = re.sub(r"[,/\\|\-–—]\s*[,/\\|\-–—]+", " ", cleaned)

    # Strip leading/trailing separators and whitespace
    cleaned = re.sub(r"^[\s,/\-\–—.:;]+|[\s,/\-\–—.:;]+$", "", cleaned)

    # Normalize multiple whitespaces
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    # If nothing meaningful (no alphanumeric chars) remains, return empty string
    if not re.search(r"[A-Za-z0-9]", cleaned):
        return ""

    return cleaned


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


def detect_vertical_model_columns(
    words: list[dict],
    header_top: float,
    header_bottom: float,
    desc_x1: float,
    remarks_x0: float,
    tolerance: float = 6.0,
    padding: float = 4.0,
    first_data_row_top: Optional[float] = None,
) -> list[ModelColumn]:
    """Detect vertical model-code header(s):
    Single uppercase-letter or digit words positioned between the DESCRIPTION column
    and the REMARKS column, all with 'top' close to the header row.
    Group these characters by x-position proximity into vertical stacks.
    Sort each stack's characters by 'top' ascending and concatenate, then REVERSE
    the resulting string (e.g. read top-to-bottom as 1, P, G, B -> 1PGB -> reversed -> BGP1).
    Also supports multi-character alphanumeric words (e.g. BGP1, 1WD1) already assembled in the header model zone.
    """
    # Vertical search band: strictly around and above the header row (never below into data rows)
    y_min = max(0.0, header_top - 30.0)
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

    # Filter out words that belong to DESCRIPTION or REMARKS itself
    header_words = [
        w for w in candidate_words
        if "DESCRIPTION" not in w["text"].upper() and "REMARKS" not in w["text"].upper()
    ]

    if not header_words:
        return []

    # Single alphanumeric characters (vertical rotated model codes like BGPK, BGP1, 1WD1, 54B1)
    # Includes uppercase letters A-Z and digits 0-9 (do not omit/leave out digits)
    single_chars = [
        w for w in header_words
        if len(w["text"]) == 1 and w["text"].isalnum() and (w["text"] == w["text"].upper())
    ]
    multi_char_words = [
        w for w in header_words
        if len(w["text"]) > 1 and w["text"].isalnum() and (w["text"] == w["text"].upper()) and len(w["text"]) <= 6
    ]

    model_columns: list[ModelColumn] = []

    # Handle vertical stacks of single alphanumeric characters
    if single_chars:
        # Group by x-position proximity
        single_chars.sort(key=lambda w: (w["x0"] + w["x1"]) / 2.0)
        stacks: list[list[dict]] = []
        current_stack: list[dict] = [single_chars[0]]
        current_x = (single_chars[0]["x0"] + single_chars[0]["x1"]) / 2.0

        for w in single_chars[1:]:
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
            # Sort stack by top ascending (top-to-bottom in PDF)
            stack.sort(key=lambda w: w["top"])
            top_to_bottom_str = "".join(w["text"].upper() for w in stack)
            # Rule: REVERSE the resulting string to get the real alphanumeric model code
            real_model_code = top_to_bottom_str[::-1]
            min_x0 = min(w["x0"] for w in stack) - padding
            max_x1 = max(w["x1"] for w in stack) + padding
            model_columns.append({
                "name": real_model_code,
                "x0": min_x0,
                "x1": max_x1,
            })

    # Handle any multi-character alphanumeric words (if pdfplumber already merged vertical characters or regular word)
    for mw in multi_char_words:
        # Check if already covered by an existing stack
        mid_x = (mw["x0"] + mw["x1"]) / 2.0
        already_covered = any(col["x0"] <= mid_x <= col["x1"] for col in model_columns)
        if not already_covered:
            raw_text = mw["text"].upper()
            w_h = mw["bottom"] - mw["top"]
            w_w = mw["x1"] - mw["x0"]
            # If word is vertically elongated (height > width * 1.5), pdfplumber read top-to-bottom; reverse it
            if w_h > w_w * 1.5:
                name = raw_text[::-1]
            else:
                name = raw_text
            model_columns.append({
                "name": name,
                "x0": mw["x0"] - padding,
                "x1": mw["x1"] + padding,
            })

    # Filter out invalid model column names (e.g. a stray single digit like "1", which is never a valid model code)
    model_columns = [
        col for col in model_columns
        if not (len(col["name"]) == 1 and col["name"].isdigit())
    ]

    # Sort model columns left-to-right by x0
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

    raw_bytes: Optional[bytes] = None
    if isinstance(pdf_source, bytes):
        raw_bytes = pdf_source
        stream: io.BytesIO | str = io.BytesIO(pdf_source)
    elif isinstance(pdf_source, str):
        stream = pdf_source
        try:
            with open(pdf_source, "rb") as f:
                raw_bytes = f.read()
        except Exception:
            raw_bytes = None
    elif isinstance(pdf_source, io.BytesIO):
        try:
            pos = pdf_source.tell()
            raw_bytes = pdf_source.getvalue()
            pdf_source.seek(pos)
        except Exception:
            raw_bytes = None
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

    # Detect model name and primary model code from cover/foreword pages
    pdf_model_name: str = ""
    pdf_model_code: str = ""
    try:
        pdf_model_name, pdf_model_code = extract_model_info_from_pdf(pdf, raw_bytes=raw_bytes)
    except Exception:
        pass  # Non-fatal: fall back to detected model columns later

    all_rows: list[dict] = []
    document_model_columns: list[str] = []
    figures_seen: list[dict] = []
    seen_fig_set: set[str] = set()
    seen_fig_row_keys: set[str] = set()

    # Track state across pages (for continuation pages)
    current_fig_no: str = ""
    current_fig_name: str = ""
    last_ref_no: str = ""
    last_known_model_columns: list[ModelColumn] = []
    page_figure_map: dict[int, dict[str, str]] = {}
    format_b_fig_counter: int = 0

    total_words_extracted = 0

    # Lazy-loaded pypdfium2 doc for OCR fallback if needed
    pdfium_doc = None
    tess_binary: Optional[str] = None
    tess_checked: bool = False
    detected_doc_rot: int = 0
    doc_rot_checked: bool = False

    try:
        for page_idx, page in enumerate(pdf.pages):
            page_num = page_idx + 1

            # Extract words with coordinates
            words = page.extract_words(use_text_flow=True, keep_blank_chars=False)

            # Fallback to OCR if page has no digital words (scanned image page)
            if not words and raw_bytes:
                if not tess_checked:
                    tess_binary = find_tesseract_binary()
                    tess_checked = True

                if tess_binary:
                    try:
                        if pdfium_doc is None:
                            import pypdfium2
                            pdfium_doc = pypdfium2.PdfDocument(raw_bytes)
                        if not doc_rot_checked:
                            detected_doc_rot = detect_scanned_doc_rotation(pdfium_doc, tess_binary)
                            doc_rot_checked = True
                            if detected_doc_rot != 0:
                                logger.info("Scanned PDF auto-detected rotation: %d deg", detected_doc_rot)
                        if page_idx < len(pdfium_doc):
                            render_scale = 2.0
                            rendered_img = pdfium_doc[page_idx].render(scale=render_scale).to_pil()
                            if detected_doc_rot != 0:
                                rendered_img = rendered_img.rotate(detected_doc_rot, expand=True)
                            words = ocr_page_with_tesseract(rendered_img, tess_binary, scale_factor=render_scale, psm="3")
                            if words:
                                logger.info("Page %d: OCR fallback successfully extracted %d words via Tesseract", page_num, len(words))
                    except Exception as ocr_err:
                        logger.warning("OCR fallback failed on page %d: %s", page_num, ocr_err)

            total_words_extracted += len(words)

            # Skip empty pages
            if not words:
                if progress_callback:
                    progress_callback(page_num, total_pages, current_fig_no, current_fig_name)
                continue

            page_w = float(page.height) if detected_doc_rot in (90, 270) else float(page.width)
            page_h = float(page.width) if detected_doc_rot in (90, 270) else float(page.height)

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

            # Rule 3: Detect page heading matching FIG, FIGURE, or TABLE
            page_fig_no: Optional[str] = None
            page_fig_name: Optional[str] = None
            fig_line_idx: Optional[int] = None

            for idx, line in enumerate(lines[:8]):
                line_text = " ".join(w["text"] for w in line).strip()
                m = re.match(r"^(?:FIG\.?|FIGURE)\s*(\d+[A-Za-z]?)\s+[:\-]?\s*(.*)$", line_text, re.IGNORECASE)
                if not m:
                    m = re.match(r"^TABLE\s*(\d+(?:\.\d+)?)\s*[:\-]?\s*(.*)$", line_text, re.IGNORECASE)
                if m:
                    page_fig_no = m.group(1).strip()
                    page_fig_name = m.group(2).strip()
                    fig_line_idx = idx
                    break

            # Also check for FUNCTION N : <NAME> ASSY heading fallback (used on D2J1 and service catalogs)
            if not page_fig_no or "SERVICE" in (page_fig_name or "").upper():
                page_all_text = " ".join(w["text"] for w in words)
                m_func = re.search(r"FUNCTION\s*(\d*)\s*[:\-]\s*([A-Za-z0-9\s&]+?)(?:\s+Page|\s+\d+|$|\n)", page_all_text, re.IGNORECASE)
                if m_func:
                    f_no = m_func.group(1).strip() or (page_fig_no or "1")
                    f_name = m_func.group(2).strip()
                    if f_name:
                        page_fig_no = f_no
                        page_fig_name = f_name

            if page_fig_name:
                page_fig_name = re.sub(r"\s+SERVICE\s*$", "", page_fig_name, flags=re.IGNORECASE).strip()

            # Detect horizontal service table format (e.g. D2J1)
            is_format_b = False
            qty_w_b = [w for w in words if w["text"].upper() in ("QTY", "QTY.") and w["x0"] > (page_w * 0.4)]
            pname_w_b = [w for w in words if w["text"].upper() in ("PART", "NAME") and w["x0"] > (page_w * 0.4)]
            table_lines: list[float] = []

            if qty_w_b and pname_w_b and hasattr(page, "lines") and len(page.lines) >= 3:
                h_lines = sorted(list({round(l["top"], 1) for l in page.lines if abs(l["top"] - l["bottom"]) < 1 and l["x0"] > (page_w * 0.4)}), key=float)
                h_hdr = min(w["top"] for w in qty_w_b)
                h_lines_above = [l for l in h_lines if l <= h_hdr]
                if h_lines_above:
                    table_lines = [l for l in h_lines if l >= max(h_lines_above)]
                    if len(table_lines) >= 2:
                        is_format_b = True

            if is_format_b:
                if page_fig_name and page_fig_name != current_fig_name:
                    format_b_fig_counter += 1
                    current_fig_no = str(format_b_fig_counter)
                    current_fig_name = page_fig_name
                    last_ref_no = ""
                    figures_seen.append({
                        "fig_no": current_fig_no,
                        "fig_name": current_fig_name,
                        "first_page": page_num,
                    })
                elif not current_fig_no:
                    format_b_fig_counter += 1
                    current_fig_no = str(format_b_fig_counter)
                    current_fig_name = page_fig_name or f"FIG {format_b_fig_counter}"
                    last_ref_no = ""
                    figures_seen.append({
                        "fig_no": current_fig_no,
                        "fig_name": current_fig_name,
                        "first_page": page_num,
                    })

                page_figure_map[page_num] = {
                    "fig_no": current_fig_no,
                    "fig_name": current_fig_name,
                }
                if progress_callback:
                    progress_callback(page_num, total_pages, current_fig_no, current_fig_name)

                eff_model = pdf_model_code or "MODEL"
                if eff_model not in document_model_columns:
                    document_model_columns.append(eff_model)

                ref_x0 = 590.0
                x_ref_end = 618.0
                x_pno_start = 905.0
                x_qty_start = 1010.0
                x_rem_start = 1050.0

                for i in range(1, len(table_lines)):
                    y0 = table_lines[i-1] - 1.0
                    y1 = table_lines[i] + 1.0
                    rw = [w for w in words if y0 <= w["top"] <= y1]
                    raw_pno = "".join(w["text"] for w in rw if x_pno_start <= w["x0"] < x_qty_start).strip()
                    ref_text = " ".join(w["text"] for w in rw if w["x1"] <= x_ref_end).strip()
                    raw_desc = " ".join(w["text"] for w in rw if x_ref_end < w["x0"] < x_pno_start).strip()
                    raw_qty = "".join(w["text"] for w in rw if x_qty_start <= w["x0"] < x_rem_start).strip()
                    raw_rem = " ".join(w["text"] for w in rw if w["x0"] >= x_rem_start).strip()

                    # Skip header repetition row
                    if any(h in raw_pno.upper() for h in ("PART", "NO")):
                        continue
                    if not (raw_pno or ref_text):
                        continue

                    ref_m = re.search(r"\b(\d+[A-Za-z]?)\b", ref_text)
                    ref_no = ref_m.group(1) if ref_m else (ref_text or last_ref_no)
                    if ref_no:
                        last_ref_no = ref_no

                    part_no = normalize_part_number(raw_pno)
                    description = clean_description(raw_desc)
                    remarks_str = clean_remarks(raw_rem)

                    fig_key = f"{current_fig_no}_{current_fig_name}"
                    is_parent = fig_key not in seen_fig_row_keys
                    if is_parent:
                        seen_fig_row_keys.add(fig_key)

                    cat_code = build_catalogue_code(eff_model, current_fig_name, current_fig_no) if is_parent else ""
                    pic_val = f"{cat_code}.jpeg" if is_parent and cat_code else ""
                    model_name_val = build_model_name_record(eff_model, pdf_model_name, current_fig_name) if is_parent else ""

                    row_dict = {
                        "page": page_num,
                        "fig_no": current_fig_no,
                        "item_group": eff_model if is_parent else "",
                        "show_in_website": "",
                        "ranking": "",
                        "fig_name": current_fig_name,
                        "parent_fig_no": current_fig_no,
                        "parent_fig_name": current_fig_name,
                        "is_parent": is_parent,
                        "model_code": eff_model,
                        "catalogue_code": cat_code,
                        "model_name": model_name_val,
                        "pic": pic_val,
                        "image": pic_val,
                        "pic_path": pic_val,
                        "ref_no": ref_no,
                        "part_no": part_no,
                        "description": description,
                        "remarks": remarks_str,
                        eff_model: raw_qty,
                    }
                    all_rows.append(row_dict)
                continue

            # Format A: If page contains a FIG heading, update current figure state
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

            # Rule 4: Detect header row containing "DESCRIPTION" and "REMARKS" (Format A)
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
            remarks_x0 = remarks_word["x0"] if remarks_word else (page_w * 0.85)

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
            table_left_x = min(w["x0"] for w in header_words_all) - 15.0

            first_data_row_top = (
                min(w["top"] for w in lines[first_data_line_idx])
                if (first_data_line_idx < len(lines) and lines[first_data_line_idx])
                else None
            )

            # Rule 5: Detect vertical model columns
            model_columns = detect_vertical_model_columns(
                words=words,
                header_top=header_top,
                header_bottom=header_bottom,
                desc_x1=desc_x1,
                remarks_x0=remarks_x0,
                first_data_row_top=first_data_row_top,
            )

            if model_columns:
                last_known_model_columns = model_columns
                for col in model_columns:
                    if col["name"] not in document_model_columns:
                        document_model_columns.append(col["name"])
            elif last_known_model_columns:
                # Reuse model columns from previous figure/page if header didn't have new ones
                model_columns = last_known_model_columns
            elif pdf_model_code:
                # Header didn't have vertical stacked letters (e.g. single-model scanned catalogue),
                # but pdf_model_code was identified from cover. Create single model column between DESCRIPTION and REMARKS.
                col_x0 = desc_x1 + 5.0
                col_x1 = remarks_x0 - 5.0
                model_columns = [{"name": pdf_model_code, "x0": col_x0, "x1": col_x1}]
                last_known_model_columns = model_columns
                if pdf_model_code not in document_model_columns:
                    document_model_columns.append(pdf_model_code)

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
                # Filter out words outside the table boundary (e.g. diagram illustration callouts on scanned pages)
                line = [w for w in line if w["x0"] >= table_left_x]
                if not line:
                    continue

                # Skip standalone page footer lines near the bottom
                # Rule 7: Skip standalone page-footer lines (a single centered digit near bottom)
                line_avg_top = sum(w["top"] for w in line) / len(line)
                if line_avg_top > page_h * 0.88:
                    line_text = " ".join(w["text"] for w in line).strip()
                    if re.match(r"^\d{1,4}$", line_text):
                        continue
                    # Also skip illustration figure tag codes at bottom left (e.g. B7JE470-V010, FWD)
                    if len(line) <= 2 and all(w["x1"] < page_w * 0.4 for w in line):
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

                # Filter out leading non-alphanumeric OCR artifacts
                while left_words and not re.search(r"[A-Za-z0-9]", left_words[0]["text"]):
                    left_words.pop(0)

                if not left_words:
                    continue

                # Check if first word is REF NO: plain integer, optionally prefixed by "*" or letter suffix
                first_word_text = re.sub(r"^[^\w]+", "", left_words[0]["text"]).strip()
                is_ref_no = bool(re.match(r"^\*?\d{1,3}[A-Za-z]?$", first_word_text))

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

                # All following left-side words joined with spaces are DESCRIPTION (dots, dashes, underscores, commas stripped)
                raw_description = " ".join(w["text"] for w in remaining_words[1:]).strip()
                description = clean_description(raw_description)

                remarks_str = clean_remarks(" ".join(remarks_words))

                fig_key = f"{current_fig_no}_{current_fig_name}"
                is_parent = fig_key not in seen_fig_row_keys
                if is_parent:
                    seen_fig_row_keys.add(fig_key)

                primary_model = (
                    model_columns[0]["name"]
                    if model_columns
                    else (document_model_columns[0] if document_model_columns else "MODEL")
                )
                cat_code = (
                    build_catalogue_code(primary_model, current_fig_name, current_fig_no)
                    if is_parent
                    else ""
                )
                pic_val = (
                    f"{cat_code}.jpeg"
                    if is_parent and cat_code
                    else ""
                )

                # Determine effective model code for this row
                # Prefer detected model column code; fall back to pdf_model_code from cover page
                effective_model_code = primary_model if primary_model != "MODEL" else (pdf_model_code or primary_model)
                model_name_val = (
                    build_model_name_record(effective_model_code, pdf_model_name, current_fig_name)
                    if is_parent
                    else ""
                )

                # Construct row
                row_dict: dict = {
                    "page": page_num,
                    "fig_no": current_fig_no,
                    "item_group": effective_model_code if is_parent else "",
                    "show_in_website": "",
                    "ranking": "",
                    "fig_name": current_fig_name,
                    "parent_fig_no": current_fig_no,
                    "parent_fig_name": current_fig_name,
                    "is_parent": is_parent,
                    "model_code": effective_model_code,
                    "catalogue_code": cat_code,
                    "model_name": model_name_val,
                    "pic": pic_val,
                    "image": pic_val,
                    "pic_path": pic_val,
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
        if pdfium_doc is not None:
            try:
                pdfium_doc.close()
            except Exception:
                pass
        pdf.close()

    # If no words at all were extracted across all pages, text layer is absent
    if total_words_extracted == 0:
        tess_installed = bool(find_tesseract_binary())
        if not tess_installed:
            raise NoTextLayerError(
                "This PDF is a scanned image and contains no extractable text layer.\n"
                "To extract scanned PDFs, please install Tesseract OCR (e.g. winget install UB-Mannheim.TesseractOCR) "
                "or provide a digital vector PDF catalogue."
            )
        else:
            raise NoTextLayerError(
                "No readable text or parts data could be recognized from this scanned PDF. "
                "Please ensure the PDF pages are clear, properly oriented, and readable."
            )

    # Ensure document_model_columns has all models found
    if not document_model_columns and last_known_model_columns:
        document_model_columns = [col["name"] for col in last_known_model_columns]

    # Fill default empty string for any model columns missing in earlier rows
    for row in all_rows:
        for model in document_model_columns:
            if model not in row:
                row[model] = ""

    # Disambiguate repeated ref_no within each figure (e.g. 1A, 1B, 2A, 2B etc.)
    all_rows = disambiguate_repeated_ref_numbers(all_rows)

    # Calculate remark_flag: For any figure group where any child/parent record has non-empty remarks,
    # mark 'X' in the row where that figure starts (parent row), and leave child rows blank.
    figs_with_remarks = set()
    for row in all_rows:
        fn = str(row.get("parent_fig_no") or row.get("fig_no") or "").strip()
        fnn = str(row.get("parent_fig_name") or row.get("fig_name") or "").strip()
        k = (fn, fnn) if (fn or fnn) else ("page", str(row.get("page", "")))
        if str(row.get("remarks") or "").strip():
            figs_with_remarks.add(k)

    last_fig_key = None
    for row in all_rows:
        fn = str(row.get("parent_fig_no") or row.get("fig_no") or "").strip()
        fnn = str(row.get("parent_fig_name") or row.get("fig_name") or "").strip()
        k = (fn, fnn) if (fn or fnn) else ("page", str(row.get("page", "")))
        if k != last_fig_key:
            last_fig_key = k
            row["remark_flag"] = "X" if k in figs_with_remarks else ""
        else:
            row["remark_flag"] = ""

    # Append custom sections at the end of Parts Name:
    # 1. PART KITS & SETS + 9 blank rows below it
    # 2. REGULAR SERVICE PARTS + 14 blank rows below it
    if all_rows:
        primary_doc_model = (
            document_model_columns[0]
            if document_model_columns
            else (pdf_model_code or "MODEL")
        )
        custom_sections = [
            ("PART KITS & SETS", 9),
            ("REGULAR SERVICE PARTS", 14),
        ]
        for section_name, blank_rows_count in custom_sections:
            cat_code = build_catalogue_code(primary_doc_model, section_name, "")
            pic_val = f"{cat_code}.jpeg" if cat_code else ""
            model_name_val = build_model_name_record(primary_doc_model, pdf_model_name, section_name)

            parent_section_row: dict[str, Any] = {
                "page": "",
                "fig_no": "",
                "item_group": primary_doc_model,
                "show_in_website": "",
                "ranking": "",
                "fig_name": section_name,
                "parent_fig_no": "",
                "parent_fig_name": section_name,
                "is_parent": True,
                "is_custom_section": True,
                "model_code": primary_doc_model,
                "catalogue_code": cat_code,
                "model_name": model_name_val,
                "pic": pic_val,
                "image": pic_val,
                "pic_path": pic_val,
                "ref_no": "",
                "part_no": "",
                "description": "",
                "remarks": "",
                "remark_flag": "",
            }
            for model in document_model_columns:
                parent_section_row[model] = ""
            all_rows.append(parent_section_row)

            for _ in range(blank_rows_count):
                blank_child_row: dict[str, Any] = {
                    "page": "",
                    "fig_no": "",
                    "item_group": "",
                    "show_in_website": "",
                    "ranking": "",
                    "fig_name": "",
                    "parent_fig_no": "",
                    "parent_fig_name": section_name,
                    "is_parent": False,
                    "is_custom_section": True,
                    "model_code": primary_doc_model,
                    "catalogue_code": "",
                    "model_name": "",
                    "pic": "",
                    "image": "",
                    "pic_path": "",
                    "ref_no": "",
                    "part_no": "",
                    "description": "",
                    "remarks": "",
                    "remark_flag": "",
                }
                for model in document_model_columns:
                    blank_child_row[model] = ""
                all_rows.append(blank_child_row)

    return {
        "rows": all_rows,
        "model_columns": document_model_columns,
        "total_pages": total_pages,
        "figures": figures_seen,
        "page_figure_map": page_figure_map,
    }
