"""Product & Parts SEO Metadata Generator Module

Generates e-commerce & SEO-optimized:
1. Product Title: arranged as [BRAND] [MODEL CODE] [MODEL] [PARTS NAME] (IN CAPS)
   Meta Title: arranged as [Brand] [Model] [MODEL CODE] [Parts Name] (Title Case, model typed before model code)
2. Meta Long Description: strictly 151-158 characters describing the genuine OEM part,
   diagram assembly, and INDIA SPARE replacement guarantee.

Features:
- Main parts only (diagram figures/assemblies e.g. CYLINDER HEAD) without child parts (bolts/nuts).
- Configurable text inputs: Brand (default YAMAHA), Model (blank by default), Series (default "series").
- Direct association with diagram images: YAM_{MODEL_CODE}_{CLEAN_FIG_NAME}.jpeg.
- Export to Excel (.xlsx) and CSV with BOM.
"""

from __future__ import annotations

import csv
import io
import random
import re
from typing import Any, Optional

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from app.excel_export import build_catalogue_code
from app.parts_extractor import clean_part_number


def sanitize_filename_segment(text: str) -> str:
    """Sanitize string for clean filenames matching image_tools conventions."""
    if not text:
        return ""
    clean = re.sub(r'[\\/*?:"<>|]', "", text)
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean


def resolve_image_filename(fig_name: str, model_code: str = "") -> str:
    """Resolve the associated diagram image filename for a main part.
    Matches naming standard: YAM_{MODEL_CODE}_{CLEAN_FIG_NAME}.jpeg
    """
    clean_fig = sanitize_filename_segment(fig_name) or "DIAGRAM"
    model = sanitize_filename_segment(model_code).strip() or "MODEL"
    return f"YAM_{model}_{clean_fig}.jpeg"


def clean_no_commas(text: str) -> str:
    """Remove all commas and normalize whitespace without commas between words."""
    if not text:
        return ""
    cleaned = re.sub(r"[,]", "", text)
    return re.sub(r"\s+", " ", cleaned).strip()


def format_india_spare(text: str) -> str:
    """Ensure any occurrence of 'india spare' or 'indiaspare' is formatted strictly as 'IndiaSpare'."""
    if not text:
        return ""
    return re.sub(r"(?i)\bindia\s*spare\b|\bindiaspare\b", "IndiaSpare", text)


def preserve_caps(text: str, model: str = "", model_code: str = "") -> str:
    """Ensure 'IndiaSpare' and model name in ALL CAPS from model text box are preserved."""
    if not text:
        return ""
    formatted = format_india_spare(text)
    if model:
        m_clean = model.strip().upper()
        if m_clean:
            # Word boundary regex with case-insensitivity
            pattern = re.compile(rf"(?i)\b{re.escape(m_clean)}\b")
            formatted = pattern.sub(m_clean, formatted)
            if "-" in m_clean:
                parts = [re.escape(p.strip()) for p in m_clean.split("-") if p.strip()]
                dash_sep = r"\s*-\s*"
                dash_joined = dash_sep.join(parts)
                dash_pattern = re.compile(r"(?i)\b" + dash_joined + r"\b")
                formatted = dash_pattern.sub(m_clean, formatted)
    return formatted


def prompt_references_child_cells(prompt: Optional[str]) -> bool:
    """Return True if prompt explicitly references child cells, child parts, child rows, or all parts."""
    if not prompt:
        return False
    pattern = r"(?i)\bchild\b|\bchildren\b|\bchild\s*(?:cells?|parts?|rows?|items?|components?)\b|\ball\s*(?:parts?|cells?|rows?)\b"
    return bool(re.search(pattern, str(prompt)))



def build_product_title(
    brand: str,
    model_code: str,
    part_name: str,
    model: str = "",
    series: str = "",
) -> str:
    """Build product title (Short Description) in ALL CAPS without commas between words.
    Sequence: BRAND MODEL_CODE (MODEL if present) (SERIES if present after MODEL) PARTS_NAME
    """
    b = (brand or "YAMAHA").strip().upper()
    mc = (model_code or "MODEL").strip().upper()
    mn = (model or "").strip().upper()
    ser = (series or "").strip().upper()
    p = (part_name or "PARTS").strip().upper()

    parts = [b, mc]
    if mn:
        parts.append(mn)
        if ser:
            parts.append(ser)
    elif ser and ser != "SERIES":
        parts.append(ser)
    parts.append(p)

    title = clean_no_commas(" ".join(parts)).upper()
    return preserve_caps(title, model=mn, model_code=mc)


def build_meta_title(
    brand: str,
    model_code: str,
    part_name: str,
    model: str = "",
    series: str = "",
) -> str:
    """Build meta title separate from product title (Title Case, no commas between words).
    Model is typed before model code and output is in ALL CAPS per user mandate.
    Series is visible after Model:
    BRAND (MODEL in ALL CAPS) (SERIES if present after MODEL) MODEL_CODE PARTS_NAME | IndiaSpare.
    """
    b = (brand or "Yamaha").strip().title()
    mc = (model_code or "Model").strip().upper()
    mn = (model or "").strip().upper()  # User rule: model output should ALWAYS be in ALL CAPS even in meta title
    ser = (series or "").strip().title()
    p = (part_name or "Parts").strip().title()

    parts = [b]
    if mn:
        parts.append(mn)
        if ser:
            parts.append(ser)
    elif ser and ser.lower() != "series":
        parts.append(ser)
    parts.append(mc)
    parts.append(p)

    title = clean_no_commas(" ".join(parts)) + " | IndiaSpare"
    return preserve_caps(title, model=mn, model_code=mc)


def build_meta_short_description(
    brand: str,
    model_code: str,
    part_name: str,
    model: str = "",
) -> str:
    """Build meta short description ending with IndiaSpare without commas between words."""
    b = (brand or "YAMAHA").strip().upper()
    mc = (model_code or "MODEL").strip().upper()
    mn = (model or "").strip().upper()
    p = (part_name or "PARTS").strip().upper()

    if mn:
        desc = f"{b} {mc} {mn} {p} IndiaSpare"
    else:
        desc = f"{b} {mc} {p} IndiaSpare"
    return format_india_spare(clean_no_commas(desc))


def enforce_meta_desc_length(
    text: str,
    seed: Optional[int] = None,
    model: str = "",
    model_code: str = "",
) -> str:
    """Enforce strictly 151 to 158 characters without commas, preserving 'IndiaSpare' and model in ALL CAPS."""
    text = clean_no_commas(text).lower()
    if 151 <= len(text) <= 158:
        return preserve_caps(text, model=model, model_code=model_code)

    rng = random.Random(seed) if seed is not None else random.Random()

    pad_pool = [
        "with verified vehicle fit.",
        "with guaranteed vehicle fitment.",
        "factory replacement parts.",
        "from indiaspare today.",
        "genuine oem spare.",
        "genuine oem factory diagram assembly.",
        "with direct factory fitment.",
        "verified oem motorcycle spare.",
        "engineered for exact fitment.",
        "restoring factory performance.",
        "certified genuine oem part.",
        "with guaranteed fit and durability.",
    ]
    shuffled_pad = list(pad_pool)
    rng.shuffle(shuffled_pad)

    while len(text) < 151:
        candidates_matching = []
        for phrase in shuffled_pad:
            cand = clean_no_commas(text.rstrip(".") + " " + phrase).lower()
            if 151 <= len(cand) <= 158:
                candidates_matching.append(cand)
        if candidates_matching:
            return preserve_caps(rng.choice(candidates_matching), model=model, model_code=model_code)

        text = clean_no_commas(text.rstrip(".") + " genuine factory replacement.").lower()
        if 151 <= len(text) <= 158:
            return preserve_caps(text, model=model, model_code=model_code)

    words = text.split()
    built = ""
    for w in words:
        if len(built) + len(w) + 1 <= 158:
            built = (built + " " + w).strip()
        else:
            break

    if 151 <= len(built) <= 158:
        if not built.endswith("."):
            if len(built) + 1 <= 158:
                built += "."
        if 151 <= len(built) <= 158:
            return preserve_caps(built.lower(), model=model, model_code=model_code)

    closers = [
        "fit.", "now.", "part.", "today.", "spare.", "parts.",
        "with fit.", "exact fit.", "direct fit.",
        "with verified fit.", "with guaranteed fit.",
        "for your motorcycle.", "from indiaspare.",
        "with durable fit.", "factory direct.",
    ]
    shuffled_closers = list(closers)
    rng.shuffle(shuffled_closers)

    valid_closers = []
    for c in shuffled_closers:
        cand = clean_no_commas(built.rstrip(".") + " " + c).lower()
        if 151 <= len(cand) <= 158:
            valid_closers.append(cand)

    if valid_closers:
        return preserve_caps(rng.choice(valid_closers), model=model, model_code=model_code)

    while len(built) < 151:
        built = (built.rstrip(".") + " genuine").strip()
    if 151 <= len(built) <= 158:
        res = built.rstrip(".") + "." if len(built) + 1 <= 158 else built
        return preserve_caps(res.lower(), model=model, model_code=model_code)
    if len(built) > 158:
        last_space = built[:157].rfind(" ")
        if last_space >= 150:
            return preserve_caps((built[:last_space] + ".").lower(), model=model, model_code=model_code)
        return preserve_caps((built[:157] + ".").lower(), model=model, model_code=model_code)
    return preserve_caps(built.lower(), model=model, model_code=model_code)


def build_meta_description(
    brand: str,
    model_code: str,
    part_name: str,
    model: str = "",
    series: str = "series",
    seed: Optional[int] = None,
) -> str:
    """Build meta description strictly bounded between 151 and 158 characters without commas,
    preserving 'IndiaSpare', model in ALL CAPS, and model_code in ALL CAPS per user mandate.
    """
    b = (brand or "yamaha").strip().lower()
    mc = (model_code or "model").strip().lower()
    mn = (model or "").strip().upper()
    ser = (series or "series").strip().lower()
    p = clean_no_commas((part_name or "part").strip().lower())
    m_disp = f"{mc} {mn}".strip() if mn else mc

    rng = random.Random(seed) if seed is not None else random.Random()

    # Ordered candidate sentences designed for various part name lengths
    candidates = [
        f"buy authentic {b} {m_disp} {ser} {p} genuine oem spare parts diagram from indiaspare. high quality factory replacement parts with verified vehicle fit.",
        f"buy genuine {b} {m_disp} {ser} {p} original oem spare parts diagram from indiaspare. factory direct replacement component with verified vehicle fit.",
        f"authentic {b} {m_disp} {ser} {p} oem spare parts diagram illustration by indiaspare. factory standard direct replacement parts with verified vehicle fit.",
        f"buy authentic {b} {m_disp} {p} genuine oem spare parts diagram from indiaspare. high quality factory replacement parts with verified vehicle fit.",
        f"genuine {b} {m_disp} {p} authentic oem spare parts diagram from indiaspare. high quality factory replacement parts with verified vehicle fitment today.",
        f"buy genuine {b} {m_disp} {ser} {p} replacement parts from indiaspare. authentic oem factory specification diagram assembly with guaranteed vehicle fit.",
        f"authentic {b} {m_disp} {p} spare part from indiaspare. genuine factory standard oem diagram illustration with guaranteed durability and vehicle fitment.",
        f"original {b} {m_disp} {ser} {p} replacement component from indiaspare. premium oem factory diagram spare with guaranteed vehicle fitment and durability.",
        f"buy official {b} {m_disp} {p} genuine spare parts from indiaspare. authentic oem factory replacement diagram assembly with guaranteed fit and quality.",
        f"official {b} {m_disp} {p} spare parts from indiaspare. genuine oem factory specification replacement diagram illustration with guaranteed vehicle fitment.",
        f"authentic {b} {m_disp} {p} diagram spare part from indiaspare. high quality factory replacement component with guaranteed vehicle fit and durability.",
        f"genuine {b} {m_disp} {p} spare parts from indiaspare. authentic oem factory specification diagram assembly with guaranteed durable vehicle fitment.",
        f"buy genuine {b} {m_disp} {p} spare parts from indiaspare. authentic oem diagram assembly with guaranteed durable vehicle fitment and satisfaction.",
    ]

    valid_cands = [clean_no_commas(c) for c in candidates if 151 <= len(clean_no_commas(c)) <= 158]
    if valid_cands:
        return preserve_caps(rng.choice(valid_cands), model=mn, model_code=mc)

    # Algorithmic prefix + suffix combinations
    prefix = clean_no_commas(f"buy authentic {b} {m_disp} {p} genuine oem spare parts diagram from indiaspare.")

    suffix_bank = [
        "high quality factory replacement parts with verified vehicle fit.",
        "high quality factory replacement parts with guaranteed fitment.",
        "premium oem factory standard replacement for your vehicle.",
        "guaranteed authentic oem factory replacement with exact fit.",
        "factory direct replacement spare with guaranteed fitment.",
        "direct factory replacement component with verified fit.",
        "factory standard oem replacement with guaranteed fit.",
        "genuine factory replacement with guaranteed durability.",
        "authentic oem factory replacement with guaranteed fit.",
        "guaranteed authentic factory replacement spare parts.",
        "factory replacement diagram with verified fitment.",
        "verified factory replacement with guaranteed fit.",
        "genuine oem factory replacement with verified vehicle fit.",
        "direct factory replacement parts with verified fit.",
        "premium factory replacement with guaranteed fitment.",
    ]

    valid_combos = []
    for s in suffix_bank:
        cand = clean_no_commas(f"{prefix} {s}")
        if 151 <= len(cand) <= 158:
            valid_combos.append(cand)

    if valid_combos:
        return preserve_caps(rng.choice(valid_combos), model=mn, model_code=mc)

    base = clean_no_commas(
        f"buy authentic {b} {m_disp} {p} genuine oem spare parts diagram from indiaspare. "
        f"factory replacement with verified fitment and durable performance guarantee."
    )
    words = base.split()
    cand = ""
    for w in words:
        if len(cand) + len(w) + 1 <= 154:
            cand = (cand + " " + w).strip()
        else:
            break

    closing_phrases = [
        " with verified fit.",
        " with guaranteed fit.",
        " for your vehicle.",
        " from indiaspare.",
        " today.",
    ]
    shuffled_cp = list(closing_phrases)
    rng.shuffle(shuffled_cp)
    for cp in shuffled_cp:
        test = clean_no_commas(cand.rstrip(".") + cp)
        if 151 <= len(test) <= 158:
            return preserve_caps(test, model=mn, model_code=mc)

    return preserve_caps(enforce_meta_desc_length(cand or base, seed=seed, model=mn, model_code=mc), model=mn, model_code=mc)


# Backwards compatibility alias
build_long_description = build_meta_description


def build_product_description(
    brand: str,
    model_code: str,
    part_name: str,
    model: str = "",
    series: str = "series",
) -> str:
    """Build rich product description strictly bounded between 120 and 140 words without commas."""
    b = (brand or "YAMAHA").strip().upper()
    mc = (model_code or "MODEL").strip().upper()
    mn = (model or "").strip().upper()
    ser = (series or "").strip().upper()
    p = clean_no_commas((part_name or "PARTS ASSEMBLY").strip().upper())
    parts_model = [mc]
    if mn:
        parts_model.append(mn)
        if ser:
            parts_model.append(ser)
    elif ser and ser.lower() != "series":
        parts_model.append(ser)
    m_disp = " ".join(parts_model).strip()

    p1 = (
        f"This authentic {b} {m_disp} {p} is an original OEM factory specification component "
        f"designed specifically for your vehicle assembly. Manufactured under strict quality standards "
        f"this genuine replacement part provides exact dimensional accuracy and long term mechanical reliability. "
        f"It directly replaces worn or damaged factory components to restore optimum operating performance."
    )
    p2 = (
        f"Every genuine {b} spare part is engineered using premium grade materials capable of withstanding severe "
        f"operating conditions high heat and mechanical stress. The precision manufacturing ensures seamless compatibility "
        f"with adjacent assembly parts preventing premature wear and maintaining factory efficiency across all riding conditions."
    )
    p3 = (
        f"Order your authentic {b} {m_disp} {p} diagram spare from IndiaSpare today. "
        f"We provide verified authentic OEM components with guaranteed fitment secure protective packaging and dependable delivery. "
        f"Upgrade your motorcycle with confidence using certified factory parts built for durability and road safety."
    )

    full_text = clean_no_commas(f"{p1} {p2} {p3}")
    words = full_text.split()

    if len(words) > 140:
        words = words[:130]
        full_text = " ".join(words)
        last_dot = full_text.rfind(".")
        if last_dot > 0:
            full_text = full_text[:last_dot + 1]
            words = full_text.split()

    addon_sentences = [
        "Each component is thoroughly inspected to verify genuine factory build quality.",
        "Trust IndiaSpare for 100% authentic OEM replacement parts backed by guaranteed vehicle fitment.",
        "Proper installation following the official service manual guidelines is always recommended.",
        "Keep your two wheeler operating at peak performance with authentic factory components.",
    ]
    for s in addon_sentences:
        if len(words) < 120:
            full_text = full_text.rstrip(".") + ". " + clean_no_commas(s)
            words = full_text.split()
        else:
            break

    if len(words) < 120:
        needed = 120 - len(words)
        padding_words = [
            "All", "components", "meet", "stringent", "automotive", "quality", "standards",
            "and", "provide", "uncompromised", "safety", "on", "every", "journey", "across",
            "all", "road", "conditions", "without", "exception"
        ]
        full_text = full_text.rstrip(".") + ". " + " ".join(padding_words[:needed]) + "."
        words = full_text.split()
    elif len(words) > 140:
        words = words[:135]
        full_text = " ".join(words).rstrip(".") + "."

    return preserve_caps(full_text, model=mn, model_code=mc)


def generate_main_part_metadata(
    figure: dict[str, Any],
    model_code: str,
    brand: str = "YAMAHA",
    model: str = "",
    series: str = "series",
    page: int = 1,
    blank_descriptions: bool = True,
) -> dict[str, Any]:
    """Generate SEO and product metadata for a single main part (Figure Assembly)."""
    fig_no = str(figure.get("fig_no") or "").strip()
    part_name = str(figure.get("fig_name") or "").strip() or "PARTS ASSEMBLY"
    b = (brand or "YAMAHA").strip().upper()
    mc = (model_code or "MODEL").strip().upper()
    mn = (model or "").strip().upper()
    ser = (series or "series").strip()
    p = int(figure.get("first_page") or figure.get("page") or page or 1)

    parts_model_str = [mc]
    if mn:
        parts_model_str.append(mn)
        if ser:
            parts_model_str.append(ser.upper())
    elif ser and ser.lower() != "series":
        parts_model_str.append(ser.upper())
    model_str = " ".join(parts_model_str)

    # 1. Product Title: strictly in CAPS, separate, no commas, Series visible after Model
    prod_title = build_product_title(brand=b, model_code=mc, part_name=part_name, model=mn, series=ser)

    # 2. Meta Title: separate from product title, Title Case, no commas, Series visible after Model
    meta_title = build_meta_title(brand=b, model_code=mc, part_name=part_name, model=mn, series=ser)

    # 3. Meta Description & Product Description: blank during PDF scan/initial extraction per user specification
    if blank_descriptions:
        meta_desc = ""
        prod_desc = ""
    else:
        meta_desc = build_meta_description(brand=b, model_code=mc, part_name=part_name, model=mn, series=ser)
        prod_desc = build_product_description(brand=b, model_code=mc, part_name=part_name, model=mn, series=ser)

    img_filename = resolve_image_filename(part_name, model_code=mc)

    record = {
        "fig_no": fig_no,
        "part_name": part_name,
        "catalogue_code": build_catalogue_code(mc, part_name, fig_no),
        "description": part_name,
        "part_no": f"FIG.{fig_no}" if fig_no else part_name,
        "clean_part_no": f"{mc}-FIG{fig_no}" if fig_no else part_name,
        "ref_no": "1",
        "brand": b,
        "model_code": mc,
        "model": mn,
        "series": ser,
        "compatible_models": model_str,
        "image_filename": img_filename,
        "product_title": prod_title,
        "meta_title": meta_title,
        "meta_description": meta_desc,
        "meta_long_description": meta_desc,
        "meta_desc_chars": len(meta_desc),
        "long_desc_length": len(meta_desc),
        "product_description": prod_desc,
        "product_desc_words": len(prod_desc.split()) if prod_desc else 0,
        "page": p,
        "remarks": "",
    }
    for k, v in record.items():
        if isinstance(v, str) and ("india spare" in v.lower() or "indiaspare" in v.lower()):
            record[k] = format_india_spare(v)
    return record


def generate_child_part_metadata(
    row: dict[str, Any],
    model_columns: list[str],
    brand: str = "YAMAHA",
    model: str = "",
    series: str = "series",
    model_code: str = "",
    blank_descriptions: bool = True,
) -> dict[str, Any]:
    """Generate SEO and product metadata for an individual child part row (fallback mode)."""
    part_no = str(row.get("part_no") or "").strip()
    clean_no = clean_part_number(part_no)
    desc = str(row.get("description") or "").strip() or "PART"
    fig_name = str(row.get("fig_name") or "").strip() or "ASSEMBLY"
    fig_no = str(row.get("fig_no") or "").strip()
    ref_no = str(row.get("ref_no") or "").strip()
    page = int(row.get("page") or 1)

    b = (brand or "YAMAHA").strip().upper()
    mc = (model_code or ("_".join(model_columns) if model_columns else "MODEL")).strip().upper()
    mn = (model or "").strip().upper()
    ser = (series or "series").strip()

    parts_model_str = [mc]
    if mn:
        parts_model_str.append(mn)
        if ser:
            parts_model_str.append(ser.upper())
    elif ser and ser.lower() != "series":
        parts_model_str.append(ser.upper())
    model_str = " ".join(parts_model_str)
    full_part_name = f"{desc} {fig_name}".strip()

    # Per user rule: Child rows of short description and meta title must be blank
    prod_title = ""
    meta_title = ""
    if blank_descriptions:
        meta_desc = ""
        prod_desc = ""
    else:
        meta_desc = build_meta_description(brand=b, model_code=mc, part_name=desc, model=mn, series=ser)
        prod_desc = build_product_description(brand=b, model_code=mc, part_name=desc, model=mn, series=ser)
    img_filename = resolve_image_filename(fig_name, model_code=mc)

    record = {
        "fig_no": fig_no,
        "part_name": desc,
        "catalogue_code": build_catalogue_code(mc, fig_name, fig_no),
        "description": "",  # Blank per user rule for child cells
        "raw_description": desc,
        "component_description": desc,
        "part_no": part_no,
        "clean_part_no": clean_no,
        "ref_no": ref_no,
        "brand": b,
        "model_code": mc,
        "model": mn,
        "series": ser,
        "compatible_models": model_str,
        "image_filename": img_filename,
        "product_title": prod_title,
        "meta_title": meta_title,
        "meta_description": meta_desc,
        "meta_long_description": meta_desc,
        "meta_desc_chars": len(meta_desc),
        "long_desc_length": len(meta_desc),
        "product_description": prod_desc,
        "product_desc_words": len(prod_desc.split()) if prod_desc else 0,
        "page": page,
        "remarks": str(row.get("remarks") or ""),
    }
    # Copy all model quantity columns from extracted row
    for m in model_columns:
        if m in row:
            record[m] = row[m]

    for k, v in record.items():
        if isinstance(v, str) and ("india spare" in v.lower() or "indiaspare" in v.lower()):
            record[k] = format_india_spare(v)
    return record


def generate_catalog_metadata(
    rows: list[dict[str, Any]],
    model_columns: list[str],
    brand: str = "YAMAHA",
    model: str = "",
    series: str = "series",
    model_code: str = "",
    main_parts_only: Optional[bool] = None,
    figures: Optional[list[dict[str, Any]]] = None,
    style: str = "ecommerce",
    custom_templates: Optional[dict[str, str]] = None,
    blank_descriptions: bool = True,
    parts_scope: Optional[str] = None,
    user_prompt: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Generate SEO metadata for catalog according to the currently extracted Excel.
    
    Structure:
    - Parent cell (first row of each figure): populated Fig No., Catalog Name, Catalogue Code,
      Product Title and Meta Title. Descriptions remain blank during scan.
    - Child cells under that figure: Fig No., Catalog Name, and Catalogue Code remain blank.
      Descriptions for child cells are NEVER generated on their own until the user explicitly
      references child cells in the prompt.
    - parts_scope: 'all' (default if main_parts_only not True), 'parent', or 'child'.
    """
    model_upper = (model or "").strip().upper()
    mc = model_code
    if not mc:
        if model_columns:
            mc = "_".join(str(m).strip() for m in model_columns if str(m).strip())
        else:
            mc = "MODEL"

    b = (brand or "YAMAHA").strip().upper()
    mn = model_upper
    ser = (series or "series").strip()

    parts_model_str = [mc]
    if mn:
        parts_model_str.append(mn)
        if ser:
            parts_model_str.append(ser.upper())
    elif ser and ser.lower() != "series":
        parts_model_str.append(ser.upper())
    model_str = " ".join(parts_model_str)

    allow_child_desc = prompt_references_child_cells(user_prompt)

    results: list[dict[str, Any]] = []

    if rows and len(rows) > 0:
        last_fig_key = None
        for r_idx, r in enumerate(rows):
            raw_fno = str(r.get("parent_fig_no") or r.get("fig_no") or "").strip()
            raw_fname = str(r.get("parent_fig_name") or r.get("fig_name") or "").strip()
            fig_key = (raw_fno, raw_fname) if (raw_fno or raw_fname) else ("row", str(r_idx))

            if r.get("is_parent") is not None:
                is_parent = bool(r.get("is_parent"))
            else:
                is_parent = (fig_key != last_fig_key)

            if is_parent:
                last_fig_key = fig_key
                curr_fno = raw_fno
                curr_fname = raw_fname
                curr_cat_code = r.get("catalogue_code") or build_catalogue_code(mc, raw_fname, raw_fno)
            else:
                curr_fno = ""
                curr_fname = ""
                curr_cat_code = ""

            part_no = str(r.get("part_no") or "").strip()
            clean_no = str(r.get("clean_part_no") or (clean_part_number(part_no) if part_no else ""))
            desc = str(r.get("description") or "").strip()
            ref_no = str(r.get("ref_no") or "").strip()
            page = int(r.get("page") or 1)
            remarks = str(r.get("remarks") or "")

            img_filename = resolve_image_filename(raw_fname or desc, model_code=mc)

            if is_parent:
                # Parent cell's parts name only for short description and meta title
                display_name = raw_fname or desc or "PARTS ASSEMBLY"
                prod_title = build_product_title(brand=b, model_code=mc, part_name=display_name, model=mn, series=ser)
                meta_title = build_meta_title(brand=b, model_code=mc, part_name=display_name, model=mn, series=ser)
                if blank_descriptions:
                    meta_desc = ""
                    prod_desc = ""
                else:
                    meta_desc = build_meta_description(brand=b, model_code=mc, part_name=display_name, model=mn, series=ser)
                    prod_desc = build_product_description(brand=b, model_code=mc, part_name=display_name, model=mn, series=ser)
                display_desc = desc or display_name
            else:
                # Per user rule: child rows of short description and meta title must be strictly blank!
                # Per user rule: description column child cell must ALSO be blank in default/combined view!
                prod_title = ""
                meta_title = ""
                if allow_child_desc and not blank_descriptions:
                    child_name = desc or "PART"
                    meta_desc = build_meta_description(brand=b, model_code=mc, part_name=child_name, model=mn, series=ser)
                    prod_desc = build_product_description(brand=b, model_code=mc, part_name=child_name, model=mn, series=ser)
                else:
                    meta_desc = ""
                    prod_desc = ""
                display_desc = desc if parts_scope == "child" else ""

            item: dict[str, Any] = {
                "fig_no": curr_fno,
                "part_name": curr_fname,
                "catalog_name": curr_fname,
                "catalogue_code": curr_cat_code,
                "parent_fig_no": raw_fno,
                "parent_fig_name": raw_fname,
                "is_parent": is_parent,
                "cell_type": "Parent" if is_parent else "Child",
                "ref_no": ref_no,
                "part_no": part_no,
                "clean_part_no": clean_no,
                "description": display_desc,
                "raw_description": desc,
                "component_description": desc,
                "brand": b,
                "model_code": mc,
                "model": mn,
                "series": ser,
                "compatible_models": model_str,
                "image_filename": img_filename,
                "product_title": prod_title,
                "meta_title": meta_title,
                "meta_description": meta_desc,
                "meta_long_description": meta_desc,
                "meta_desc_chars": len(meta_desc) if meta_desc else 0,
                "long_desc_length": len(meta_desc) if meta_desc else 0,
                "product_description": prod_desc,
                "product_desc_words": len(prod_desc.split()) if prod_desc else 0,
                "page": page,
                "remarks": remarks,
            }

            for m in model_columns:
                if m in r:
                    item[m] = r[m]

            for k, v in item.items():
                if isinstance(v, str) and ("india spare" in v.lower() or "indiaspare" in v.lower()):
                    item[k] = format_india_spare(v)

            results.append(item)

    elif figures and len(figures) > 0:
        for fig in figures:
            item = generate_main_part_metadata(
                figure=fig,
                model_code=mc,
                brand=b,
                model=mn,
                series=ser,
                blank_descriptions=blank_descriptions,
            )
            item["is_parent"] = True
            item["cell_type"] = "Parent"
            item["parent_fig_no"] = str(fig.get("fig_no") or "")
            item["parent_fig_name"] = str(fig.get("fig_name") or "")
            results.append(item)

    # Scope resolution
    if parts_scope == "parent" or (parts_scope is None and main_parts_only is True):
        return [it for it in results if it.get("is_parent", False)]
    elif parts_scope == "child":
        return [it for it in results if not it.get("is_parent", False)]

    return results


def export_metadata_excel(
    meta_rows: list[dict[str, Any]],
    brand: str = "YAMAHA",
    model_columns: Optional[list[str]] = None,
    raw_rows: Optional[list[dict[str, Any]]] = None,
    selected_columns: Optional[list[str]] = None,
) -> io.BytesIO:
    """Generate a single-sheet Excel workbook (.xlsx) containing both extracted catalogue columns
    and generated SEO metadata. Does NOT create a separate sheet for child cells.
    If the user wants to see child cells, they can view them by applying Excel's filter.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Product Metadata"

    header_fill = PatternFill(start_color="1B365D", end_color="1B365D", fill_type="solid")  # Navy Blue
    header_font = Font(name="Arial", size=11, bold=True, color="FFFFFF")
    header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    data_font = Font(name="Arial", size=10)
    center_align = Alignment(horizontal="center", vertical="center")
    left_align = Alignment(horizontal="left", vertical="center")
    wrap_left_align = Alignment(horizontal="left", vertical="center", wrap_text=True)

    thin_border_side = Side(style="thin", color="D3D3D3")
    thin_border = Border(
        left=thin_border_side,
        right=thin_border_side,
        top=thin_border_side,
        bottom=thin_border_side,
    )

    # Resolve dynamic model quantity columns
    resolved_model_cols: list[str] = []
    if model_columns:
        resolved_model_cols = [str(m).strip() for m in model_columns if str(m).strip()]
    else:
        seen_cols: set[str] = set()
        for r in (meta_rows + (raw_rows or [])):
            for k in r.keys():
                if k not in {
                    "fig_no", "fig_name", "part_name", "catalog_name", "catalogue_code",
                    "description", "part_no", "clean_part_no", "ref_no", "brand",
                    "model_code", "model", "series", "compatible_models", "image_filename",
                    "product_title", "meta_title", "meta_description", "meta_long_description",
                    "meta_desc_chars", "long_desc_length", "product_description",
                    "product_desc_words", "page", "remarks", "first_page", "id", "is_parent",
                    "cell_type", "parent_fig_no", "parent_fig_name", "ai_analysis", "ai_generated"
                }:
                    if re.match(r"^[A-Z0-9]{3,6}$", str(k).upper()):
                        seen_cols.add(str(k))
        resolved_model_cols = sorted(list(seen_cols))

    # Single Sheet Headers: Extracted Parts Catalogue Columns arranged on the LEFT, then SEO & Metadata Columns on the RIGHT
    headers: list[tuple[str, str, Any, int]] = [
        # --- Extracted Parts Catalogue Columns (Left) ---
        ("Page", "page", center_align, 8),
        ("Fig No.", "fig_no", center_align, 10),
        ("Catalog Name", "part_name", left_align, 28),
        ("Catalogue Code", "catalogue_code", left_align, 26),
        ("Ref No.", "ref_no", center_align, 10),
        ("Part No.", "part_no", left_align, 20),
        ("Clean Part No.", "clean_part_no", left_align, 20),
        ("Description", "description", left_align, 30),
    ]

    for m in resolved_model_cols:
        headers.append((f"Qty ({m})", m, center_align, 12))

    headers.append(("Remarks", "remarks", left_align, 24))

    # --- SEO & Metadata Columns (Right) ---
    headers.extend([
        ("Brand", "brand", center_align, 14),
        ("Model Code", "model_code", center_align, 14),
        ("Model", "model", center_align, 14),
        ("Series", "series", center_align, 14),
        ("Pic", "image_filename", left_align, 32),
        ("Short Description", "product_title", wrap_left_align, 36),
        ("Meta Title", "meta_title", wrap_left_align, 36),
        ("Meta Description (151-158 Chars)", "meta_description", wrap_left_align, 60),
        ("Meta Desc Chars", "meta_desc_chars", center_align, 15),
        ("Product Description (120-140 Words)", "product_description", wrap_left_align, 75),
        ("Product Desc Words", "product_desc_words", center_align, 16),
    ])

    has_ai_analysis = any(bool(r.get("ai_analysis")) for r in meta_rows) or (
        selected_columns and any("analysis" in str(s).lower() for s in selected_columns)
    )
    if has_ai_analysis:
        headers.append(("AI Dual-Record Analysis", "ai_analysis", wrap_left_align, 60))

    # Column Selection Filter: if provided and not empty, filter headers
    if selected_columns and len(selected_columns) > 0:
        sel_set = set(selected_columns)
        sel_lower = {s.lower() for s in selected_columns}
        filtered_headers = [
            h for h in headers
            if h[1] in sel_set or h[0] in sel_set or h[1].lower() in sel_lower or h[0].lower() in sel_lower
        ]
        if filtered_headers:
            headers = filtered_headers

    # Prepare export rows: if raw_rows is provided and has more rows than meta_rows, merge to ensure all extracted parts appear
    export_rows = list(meta_rows)
    if raw_rows and len(raw_rows) > len(meta_rows):
        meta_by_fig = {}
        for it in meta_rows:
            f_k = str(it.get("parent_fig_no") or it.get("fig_no") or "").strip()
            if f_k and f_k not in meta_by_fig:
                meta_by_fig[f_k] = it

        merged_rows = []
        last_fk = None
        for idx, r in enumerate(raw_rows):
            fno = str(r.get("parent_fig_no") or r.get("fig_no") or "").strip()
            fname = str(r.get("parent_fig_name") or r.get("fig_name") or "").strip()
            fk = (fno, fname) if (fno or fname) else ("row", str(idx))
            is_parent = bool(r.get("is_parent")) if r.get("is_parent") is not None else (fk != last_fk)
            if is_parent:
                last_fk = fk

            parent_meta = meta_by_fig.get(fno, {})
            b_val = parent_meta.get("brand") or brand or "YAMAHA"
            mc_val = parent_meta.get("model_code") or (resolved_model_cols[0] if resolved_model_cols else "MODEL")
            m_val = parent_meta.get("model") or ""
            ser_val = parent_meta.get("series") or "series"
            pno = str(r.get("part_no") or "").strip()
            clean_no = str(r.get("clean_part_no") or (clean_part_number(pno) if pno else ""))
            desc = str(r.get("description") or "").strip()

            merged_item = dict(r)
            merged_item["page"] = r.get("page", 1)
            merged_item["is_parent"] = is_parent
            merged_item["parent_fig_no"] = fno
            merged_item["parent_fig_name"] = fname
            merged_item["part_name"] = fname if is_parent else ""
            merged_item["catalog_name"] = fname if is_parent else ""
            merged_item["catalogue_code"] = build_catalogue_code(mc_val, fname, fno) if is_parent else ""
            merged_item["clean_part_no"] = clean_no
            merged_item["description"] = (desc or fname) if is_parent else ""
            merged_item["raw_description"] = desc
            merged_item["component_description"] = desc
            merged_item["brand"] = b_val
            merged_item["model_code"] = mc_val
            merged_item["model"] = m_val
            merged_item["series"] = ser_val
            merged_item["image_filename"] = parent_meta.get("image_filename") or resolve_image_filename(fname, model_code=mc_val)
            merged_item["product_title"] = parent_meta.get("product_title", "") if is_parent else ""
            merged_item["meta_title"] = parent_meta.get("meta_title", "") if is_parent else ""
            merged_item["meta_description"] = parent_meta.get("meta_description") if is_parent else ""
            merged_item["meta_desc_chars"] = len(merged_item["meta_description"]) if merged_item["meta_description"] else 0
            merged_item["product_description"] = parent_meta.get("product_description") if is_parent else ""
            merged_item["product_desc_words"] = len(merged_item["product_description"].split()) if merged_item["product_description"] else 0
            if is_parent and parent_meta.get("ai_analysis"):
                merged_item["ai_analysis"] = parent_meta["ai_analysis"]

            merged_rows.append(merged_item)
        export_rows = merged_rows

    ws.row_dimensions[1].height = 28.0
    for col_idx, (label, _, _, col_width) in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=label)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = header_alignment
        cell.border = thin_border
        col_letter = get_column_letter(col_idx)
        ws.column_dimensions[col_letter].width = col_width

    only_children = bool(export_rows) and all(not bool(it.get("is_parent")) for it in export_rows)
    last_fig_key = None
    for row_idx, r in enumerate(export_rows, start=2):
        ws.row_dimensions[row_idx].height = 24.0

        raw_fno = str(r.get("parent_fig_no") or r.get("fig_no") or "").strip()
        raw_pname = str(r.get("parent_fig_name") or r.get("part_name", "") or r.get("fig_name", "") or "").strip()

        if r.get("is_parent") is not None:
            is_parent = bool(r.get("is_parent"))
        else:
            fig_key = (raw_fno, raw_pname) if (raw_fno or raw_pname) else ("row", str(row_idx))
            is_parent = (fig_key != last_fig_key)
            if is_parent:
                last_fig_key = fig_key

        if is_parent:
            curr_fno = raw_fno
            curr_pname = raw_pname
            curr_cat_code = r.get("catalogue_code") or build_catalogue_code(r.get("model_code", ""), raw_pname, raw_fno)
        else:
            curr_fno = ""
            curr_pname = ""
            curr_cat_code = ""

        for col_idx, (_, field_key, align, _) in enumerate(headers, start=1):
            if field_key == "fig_no":
                val = curr_fno
            elif field_key == "part_name":
                val = curr_pname
            elif field_key == "catalogue_code":
                val = curr_cat_code
            elif field_key == "clean_part_no":
                val = r.get("clean_part_no", "") or clean_part_number(str(r.get("part_no", "") or ""))
            elif field_key == "description":
                # User rule: child cells of Description column must be blank!
                val = (r.get("description", "") or curr_pname) if is_parent else (r.get("raw_description", "") if only_children else "")
            elif field_key == "product_title":
                val = r.get("product_title", "") if is_parent else ""
            elif field_key == "meta_title":
                val = r.get("meta_title", "") if is_parent else ""
            elif field_key == "meta_description":
                val = r.get("meta_description", "") if (is_parent or r.get("meta_description")) else ""
            elif field_key == "meta_desc_chars":
                m_desc = r.get("meta_description", "") if (is_parent or r.get("meta_description")) else ""
                val = len(m_desc) if m_desc else 0
            elif field_key == "product_description":
                val = r.get("product_description", "") if (is_parent or r.get("product_description")) else ""
            elif field_key == "product_desc_words":
                p_desc = r.get("product_description", "") if (is_parent or r.get("product_description")) else ""
                val = len(p_desc.split()) if p_desc else 0
            else:
                val = r.get(field_key, "")

            val_str = str(val) if val is not None else ""
            if "india spare" in val_str.lower() or "indiaspare" in val_str.lower():
                val_str = format_india_spare(val_str)
            cell = ws.cell(row=row_idx, column=col_idx, value=val_str)
            cell.font = data_font
            cell.alignment = align
            cell.border = thin_border
            cell.number_format = "@"

    ws.freeze_panes = "A2"
    if export_rows:
        max_col_letter = get_column_letter(len(headers))
        ws.auto_filter.ref = f"A1:{max_col_letter}{len(export_rows) + 1}"

    # STRICTLY SINGLE SHEET ONLY: No separate sheet for child cells!
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def export_metadata_csv(
    meta_rows: list[dict[str, Any]],
    model_columns: Optional[list[str]] = None,
    selected_columns: Optional[list[str]] = None,
) -> io.BytesIO:
    """Generate RFC-compliant UTF-8 CSV containing both extracted catalogue columns and generated SEO metadata.
    Supports filtering columns via selected_columns.
    """
    buf = io.StringIO()
    writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL)

    col_defs: list[tuple[str, str]] = [
        # --- Extracted Parts Catalogue Columns (Left) ---
        ("Page", "page"),
        ("Fig No.", "fig_no"),
        ("Catalog Name", "part_name"),
        ("Catalogue Code", "catalogue_code"),
        ("Ref No.", "ref_no"),
        ("Part No.", "part_no"),
        ("Clean Part No.", "clean_part_no"),
        ("Description", "description"),
    ]

    resolved_model_cols: list[str] = []
    if model_columns:
        resolved_model_cols = [str(m).strip() for m in model_columns if str(m).strip()]
    else:
        seen_cols = set()
        for r in meta_rows:
            for k in r.keys():
                if k not in {
                    "fig_no", "fig_name", "part_name", "catalogue_code", "description", "part_no",
                    "clean_part_no", "ref_no", "brand", "model_code", "model",
                    "series", "compatible_models", "image_filename", "product_title",
                    "meta_title", "meta_description", "meta_long_description",
                    "meta_desc_chars", "long_desc_length", "product_description",
                    "product_desc_words", "page", "remarks", "first_page", "id",
                    "is_parent", "cell_type", "parent_fig_no", "parent_fig_name"
                }:
                    if re.match(r"^[A-Z0-9]{3,6}$", str(k).upper()):
                        seen_cols.add(str(k))
        resolved_model_cols = sorted(list(seen_cols))

    for m in resolved_model_cols:
        col_defs.append((f"Qty ({m})", m))
    col_defs.append(("Remarks", "remarks"))

    # --- SEO & Metadata Columns (Right) ---
    col_defs.extend([
        ("Brand", "brand"),
        ("Model Code", "model_code"),
        ("Model", "model"),
        ("Series", "series"),
        ("Pic", "image_filename"),
        ("Short Description", "product_title"),
        ("Meta Title", "meta_title"),
        ("Meta Description (151-158 Chars)", "meta_description"),
        ("Meta Desc Chars", "meta_desc_chars"),
        ("Product Description (120-140 Words)", "product_description"),
        ("Product Desc Words", "product_desc_words"),
    ])

    has_ai_analysis = any(bool(r.get("ai_analysis")) for r in meta_rows) or (
        selected_columns and any("analysis" in str(s).lower() for s in selected_columns)
    )
    if has_ai_analysis:
        col_defs.append(("AI Dual-Record Analysis", "ai_analysis"))

    # Column Selection Filter: if provided and not empty, filter col_defs
    if selected_columns and len(selected_columns) > 0:
        sel_set = set(selected_columns)
        sel_lower = {s.lower() for s in selected_columns}
        filtered_cols = [
            c for c in col_defs
            if c[1] in sel_set or c[0] in sel_set or c[1].lower() in sel_lower or c[0].lower() in sel_lower
        ]
        if filtered_cols:
            col_defs = filtered_cols

    writer.writerow([c[0] for c in col_defs])

    only_children = bool(meta_rows) and all(not bool(it.get("is_parent")) for it in meta_rows)
    last_fig_key = None
    for row_idx, r in enumerate(meta_rows):
        raw_fno = str(r.get("parent_fig_no") or r.get("fig_no") or "").strip()
        raw_pname = str(r.get("parent_fig_name") or r.get("part_name", "") or r.get("fig_name", "") or "").strip()

        if r.get("is_parent") is not None:
            is_parent = bool(r.get("is_parent"))
        else:
            fig_key = (raw_fno, raw_pname) if (raw_fno or raw_pname) else ("row", str(row_idx))
            is_parent = (fig_key != last_fig_key)
            if is_parent:
                last_fig_key = fig_key

        if is_parent:
            curr_fno = raw_fno
            curr_pname = raw_pname
            curr_cat_code = r.get("catalogue_code") or build_catalogue_code(r.get("model_code", ""), raw_pname, raw_fno)
        else:
            curr_fno = ""
            curr_pname = ""
            curr_cat_code = ""

        row_vals = []
        for label, field_key in col_defs:
            if field_key == "fig_no":
                v = curr_fno
            elif field_key == "part_name":
                v = curr_pname
            elif field_key == "catalogue_code":
                v = curr_cat_code
            elif field_key == "clean_part_no":
                v = r.get("clean_part_no", "") or clean_part_number(str(r.get("part_no", "") or ""))
            elif field_key == "description":
                # User rule: child cells of Description column must be blank!
                v = (r.get("description", "") or curr_pname) if is_parent else (r.get("raw_description", "") if only_children else "")
            elif field_key == "product_title":
                v = r.get("product_title", "") if is_parent else ""
            elif field_key == "meta_title":
                v = r.get("meta_title", "") if is_parent else ""
            elif field_key == "meta_description":
                v = r.get("meta_description", "") if (is_parent or r.get("meta_description")) else ""
            elif field_key == "meta_desc_chars":
                m_desc = r.get("meta_description", "") if (is_parent or r.get("meta_description")) else ""
                v = len(m_desc) if m_desc else 0
            elif field_key == "product_description":
                v = r.get("product_description", "") if (is_parent or r.get("product_description")) else ""
            elif field_key == "product_desc_words":
                p_desc = r.get("product_description", "") if (is_parent or r.get("product_description")) else ""
                v = len(p_desc.split()) if p_desc else 0
            else:
                v = r.get(field_key, "")
            val_str = str(v) if v is not None else ""
            if "india spare" in val_str.lower() or "indiaspare" in val_str.lower():
                val_str = format_india_spare(val_str)
            row_vals.append(val_str)
        writer.writerow(row_vals)

    out = io.BytesIO(buf.getvalue().encode("utf-8-sig"))
    out.seek(0)
    return out
