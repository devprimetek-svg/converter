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
import re
from typing import Any, Optional

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

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


def build_product_title(
    brand: str,
    model_code: str,
    part_name: str,
    model: str = "",
) -> str:
    """Build product title in ALL CAPS without commas between words.
    Sequence: BRAND MODEL_CODE (MODEL if present) PARTS_NAME
    """
    b = (brand or "YAMAHA").strip().upper()
    mc = (model_code or "MODEL").strip().upper()
    mn = (model or "").strip().upper()
    p = (part_name or "PARTS").strip().upper()

    if mn:
        title = f"{b} {mc} {mn} {p}"
    else:
        title = f"{b} {mc} {p}"
    return clean_no_commas(title).upper()


def build_meta_title(
    brand: str,
    model_code: str,
    part_name: str,
    model: str = "",
) -> str:
    """Build meta title separate from product title (Title Case, no commas between words).
    Model is typed before model code: BRAND MODEL MODEL_CODE PARTS_NAME.
    """
    b = (brand or "Yamaha").strip().title()
    mc = (model_code or "Model").strip().upper()
    mn = (model or "").strip().title()
    p = (part_name or "Parts").strip().title()

    if mn:
        title = f"{b} {mn} {mc} {p}"
    else:
        title = f"{b} {mc} {p}"
    return clean_no_commas(title)


def build_meta_short_description(
    brand: str,
    model_code: str,
    part_name: str,
    model: str = "",
) -> str:
    """Build meta short description ending with INDIA SPARE without commas between words."""
    b = (brand or "YAMAHA").strip().upper()
    mc = (model_code or "MODEL").strip().upper()
    mn = (model or "").strip().upper()
    p = (part_name or "PARTS").strip().upper()

    if mn:
        desc = f"{b} {mc} {mn} {p} INDIA SPARE"
    else:
        desc = f"{b} {mc} {p} INDIA SPARE"
    return clean_no_commas(desc).upper()


def enforce_meta_desc_length(text: str) -> str:
    """Enforce strictly 151 to 158 characters without caps and without commas."""
    text = clean_no_commas(text).lower()
    if 151 <= len(text) <= 158:
        return text

    pad_pool = [
        "with verified vehicle fit.",
        "with guaranteed vehicle fitment.",
        "factory replacement parts.",
        "from india spare today.",
        "genuine oem spare.",
        "genuine oem factory diagram assembly.",
    ]
    while len(text) < 151:
        for phrase in pad_pool:
            cand = clean_no_commas(text.rstrip(".") + " " + phrase).lower()
            if 151 <= len(cand) <= 158:
                return cand
        text = clean_no_commas(text.rstrip(".") + " genuine factory replacement.").lower()
        if 151 <= len(text) <= 158:
            return text

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
            return built.lower()

    closers = [
        "fit.", "now.", "part.", "today.", "spare.", "parts.",
        "with fit.", "exact fit.", "direct fit.",
        "with verified fit.", "with guaranteed fit.",
        "for your motorcycle.", "from india spare.",
    ]
    for c in sorted(closers, key=len):
        cand = clean_no_commas(built.rstrip(".") + " " + c).lower()
        if 151 <= len(cand) <= 158:
            return cand

    while len(built) < 151:
        built = (built.rstrip(".") + " genuine").strip()
    if 151 <= len(built) <= 158:
        res = built.rstrip(".") + "." if len(built) + 1 <= 158 else built
        return res.lower()
    if len(built) > 158:
        last_space = built[:157].rfind(" ")
        if last_space >= 150:
            return (built[:last_space] + ".").lower()
        return (built[:157] + ".").lower()
    return built.lower()


def build_meta_description(
    brand: str,
    model_code: str,
    part_name: str,
    model: str = "",
    series: str = "series",
) -> str:
    """Build meta description strictly bounded between 151 and 158 characters without caps and without commas."""
    b = (brand or "yamaha").strip().lower()
    mc = (model_code or "model").strip().lower()
    mn = (model or "").strip().lower()
    ser = (series or "series").strip().lower()
    p = clean_no_commas((part_name or "part").strip().lower())
    m_disp = f"{mc} {mn}".strip() if mn else mc

    # Ordered candidate sentences designed for various part name lengths (without caps)
    candidates = [
        f"buy authentic {b} {m_disp} {ser} {p} genuine oem spare parts diagram from india spare. high quality factory replacement parts with verified vehicle fit.",
        f"buy genuine {b} {m_disp} {ser} {p} original oem spare parts diagram from india spare. factory direct replacement component with verified vehicle fit.",
        f"authentic {b} {m_disp} {ser} {p} oem spare parts diagram illustration by india spare. factory standard direct replacement parts with verified vehicle fit.",
        f"buy authentic {b} {m_disp} {p} genuine oem spare parts diagram from india spare. high quality factory replacement parts with verified vehicle fit.",
        f"genuine {b} {m_disp} {p} authentic oem spare parts diagram from india spare. high quality factory replacement parts with verified vehicle fitment today.",
        f"buy genuine {b} {m_disp} {ser} {p} replacement parts from india spare. authentic oem factory specification diagram assembly with guaranteed vehicle fit.",
        f"authentic {b} {m_disp} {p} spare part from india spare. genuine factory standard oem diagram illustration with guaranteed durability and vehicle fitment.",
        f"original {b} {m_disp} {ser} {p} replacement component from india spare. premium oem factory diagram spare with guaranteed vehicle fitment and durability.",
        f"buy official {b} {m_disp} {p} genuine spare parts from india spare. authentic oem factory replacement diagram assembly with guaranteed fit and quality.",
        f"official {b} {m_disp} {p} spare parts from india spare. genuine oem factory specification replacement diagram illustration with guaranteed vehicle fitment.",
        f"authentic {b} {m_disp} {p} diagram spare part from india spare. high quality factory replacement component with guaranteed vehicle fit and durability.",
        f"genuine {b} {m_disp} {p} spare parts from india spare. authentic oem factory specification diagram assembly with guaranteed durable vehicle fitment.",
        f"buy genuine {b} {m_disp} {p} spare parts from india spare. authentic oem diagram assembly with guaranteed durable vehicle fitment and satisfaction.",
    ]

    for c in candidates:
        c = clean_no_commas(c).lower()
        if 151 <= len(c) <= 158:
            return c

    # Algorithmic prefix + suffix combinations
    prefix = clean_no_commas(f"buy authentic {b} {m_disp} {p} genuine oem spare parts diagram from india spare.").lower()

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

    for s in suffix_bank:
        cand = clean_no_commas(f"{prefix} {s}").lower()
        if 151 <= len(cand) <= 158:
            return cand

    base = clean_no_commas(
        f"buy authentic {b} {m_disp} {p} genuine oem spare parts diagram from india spare. "
        f"factory replacement with verified fitment and durable performance guarantee."
    ).lower()
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
        " from india spare.",
        " today.",
    ]
    for cp in closing_phrases:
        test = clean_no_commas(cand.rstrip(".") + cp).lower()
        if 151 <= len(test) <= 158:
            return test

    return enforce_meta_desc_length(cand or base)


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
    p = clean_no_commas((part_name or "PARTS ASSEMBLY").strip().upper())
    m_disp = f"{mc} {mn}".strip() if mn else mc

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
        f"Order your authentic {b} {m_disp} {p} diagram spare from India Spare today. "
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
        "Trust India Spare for 100% authentic OEM replacement parts backed by guaranteed vehicle fitment.",
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

    return full_text


def generate_main_part_metadata(
    figure: dict[str, Any],
    model_code: str,
    brand: str = "YAMAHA",
    model: str = "",
    series: str = "series",
    page: int = 1,
) -> dict[str, Any]:
    """Generate SEO and product metadata for a single main part (Figure Assembly)."""
    fig_no = str(figure.get("fig_no") or "").strip()
    part_name = str(figure.get("fig_name") or "").strip() or "PARTS ASSEMBLY"
    b = (brand or "YAMAHA").strip().upper()
    mc = (model_code or "MODEL").strip().upper()
    mn = (model or "").strip()
    ser = (series or "series").strip()
    p = page or int(figure.get("first_page") or figure.get("page") or 1)

    model_str = f"{mc} {mn.upper()}".strip() if mn else mc

    # 1. Product Title: strictly in CAPS, separate, no commas
    prod_title = build_product_title(brand=b, model_code=mc, part_name=part_name, model=mn)

    # 2. Meta Title: separate from product title, Title Case, no commas (model before model code)
    meta_title = build_meta_title(brand=b, model_code=mc, part_name=part_name, model=mn)

    # 3. Meta Description: strictly 151-158 characters without caps (sentence case), no commas
    meta_desc = build_meta_description(brand=b, model_code=mc, part_name=part_name, model=mn, series=ser)

    # 4. Product Description: strictly 120-140 words, no commas
    prod_desc = build_product_description(brand=b, model_code=mc, part_name=part_name, model=mn, series=ser)

    img_filename = resolve_image_filename(part_name, model_code=mc)

    return {
        "fig_no": fig_no,
        "part_name": part_name,
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
        "product_desc_words": len(prod_desc.split()),
        "page": p,
        "remarks": "",
    }


def generate_child_part_metadata(
    row: dict[str, Any],
    model_columns: list[str],
    brand: str = "YAMAHA",
    model: str = "",
    series: str = "series",
    model_code: str = "",
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
    mn = (model or "").strip()
    ser = (series or "series").strip()

    model_str = f"{mc} {mn.upper()}".strip() if mn else mc
    full_part_name = f"{desc} {fig_name}".strip()

    prod_title = build_product_title(brand=b, model_code=mc, part_name=full_part_name, model=mn)
    meta_title = build_meta_title(brand=b, model_code=mc, part_name=full_part_name, model=mn)
    meta_desc = build_meta_description(brand=b, model_code=mc, part_name=desc, model=mn, series=ser)
    prod_desc = build_product_description(brand=b, model_code=mc, part_name=desc, model=mn, series=ser)
    img_filename = resolve_image_filename(fig_name, model_code=mc)

    return {
        "fig_no": fig_no,
        "part_name": desc,
        "description": desc,
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
        "product_desc_words": len(prod_desc.split()),
        "page": page,
        "remarks": str(row.get("remarks") or ""),
    }


def generate_catalog_metadata(
    rows: list[dict[str, Any]],
    model_columns: list[str],
    brand: str = "YAMAHA",
    model: str = "",
    series: str = "series",
    model_code: str = "",
    main_parts_only: bool = True,
    figures: Optional[list[dict[str, Any]]] = None,
    style: str = "ecommerce",
    custom_templates: Optional[dict[str, str]] = None,
) -> list[dict[str, Any]]:
    """Generate SEO metadata for catalog. Defaults to main parts only (figure assemblies)."""
    mc = model_code
    if not mc:
        if model_columns:
            mc = "_".join(str(m).strip() for m in model_columns if str(m).strip())
        else:
            mc = "MODEL"

    results: list[dict[str, Any]] = []

    if main_parts_only:
        fig_list: list[dict[str, Any]] = []
        if figures and len(figures) > 0:
            fig_list = figures
        else:
            seen_figs: set[tuple[str, str]] = set()
            for r in rows:
                fn = str(r.get("fig_name") or "").strip()
                fno = str(r.get("fig_no") or "").strip()
                if fn and (fno, fn) not in seen_figs:
                    seen_figs.add((fno, fn))
                    fig_list.append({
                        "fig_no": fno,
                        "fig_name": fn,
                        "first_page": r.get("page", 1),
                    })

        for fig in fig_list:
            item = generate_main_part_metadata(
                figure=fig,
                model_code=mc,
                brand=brand,
                model=model,
                series=series,
            )
            results.append(item)
    else:
        for r in rows:
            item = generate_child_part_metadata(
                row=r,
                model_columns=model_columns,
                brand=brand,
                model=model,
                series=series,
                model_code=mc,
            )
            results.append(item)

    return results


def export_metadata_excel(meta_rows: list[dict[str, Any]], brand: str = "YAMAHA") -> io.BytesIO:
    """Generate an Excel workbook (.xlsx) containing all generated metadata."""
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

    headers = [
        ("Fig No.", "fig_no", center_align, 10),
        ("Main Part Name", "part_name", left_align, 28),
        ("Brand", "brand", center_align, 14),
        ("Model Code", "model_code", center_align, 14),
        ("Model", "model", center_align, 14),
        ("Series", "series", center_align, 14),
        ("Associated Diagram Image", "image_filename", left_align, 32),
        ("Product Title (IN CAPS)", "product_title", wrap_left_align, 36),
        ("Meta Title", "meta_title", wrap_left_align, 36),
        ("Meta Description (151-158 Chars)", "meta_description", wrap_left_align, 60),
        ("Meta Desc Chars", "meta_desc_chars", center_align, 15),
        ("Product Description (120-140 Words)", "product_description", wrap_left_align, 75),
        ("Product Desc Words", "product_desc_words", center_align, 16),
        ("Page", "page", center_align, 8),
    ]

    ws.row_dimensions[1].height = 28.0
    for col_idx, (label, _, _, col_width) in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=label)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = header_alignment
        cell.border = thin_border
        col_letter = get_column_letter(col_idx)
        ws.column_dimensions[col_letter].width = col_width

    for row_idx, r in enumerate(meta_rows, start=2):
        ws.row_dimensions[row_idx].height = 24.0
        for col_idx, (_, field_key, align, _) in enumerate(headers, start=1):
            val = r.get(field_key, "")
            cell = ws.cell(row=row_idx, column=col_idx, value=str(val) if val is not None else "")
            cell.font = data_font
            cell.alignment = align
            cell.border = thin_border
            cell.number_format = "@"

    ws.freeze_panes = "A2"
    if meta_rows:
        max_col_letter = get_column_letter(len(headers))
        ws.auto_filter.ref = f"A1:{max_col_letter}{len(meta_rows) + 1}"

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def export_metadata_csv(meta_rows: list[dict[str, Any]]) -> io.BytesIO:
    """Generate RFC-compliant UTF-8 CSV containing all generated metadata."""
    buf = io.StringIO()
    writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL)

    headers = [
        "Fig No.",
        "Main Part Name",
        "Brand",
        "Model Code",
        "Model",
        "Series",
        "Associated Diagram Image",
        "Product Title (IN CAPS)",
        "Meta Title",
        "Meta Description (151-158 Chars)",
        "Meta Desc Chars",
        "Product Description (120-140 Words)",
        "Product Desc Words",
        "Page",
    ]
    writer.writerow(headers)

    for r in meta_rows:
        writer.writerow([
            r.get("fig_no", ""),
            r.get("part_name", ""),
            r.get("brand", "YAMAHA"),
            r.get("model_code", ""),
            r.get("model", ""),
            r.get("series", "series"),
            r.get("image_filename", ""),
            r.get("product_title", ""),
            r.get("meta_title", ""),
            r.get("meta_description", ""),
            r.get("meta_desc_chars", len(r.get("meta_description", ""))),
            r.get("product_description", ""),
            r.get("product_desc_words", len(str(r.get("product_description", "")).split())),
            r.get("page", 1),
        ])

    out = io.BytesIO(buf.getvalue().encode("utf-8-sig"))
    out.seek(0)
    return out
