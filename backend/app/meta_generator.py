"""Product & Parts SEO Metadata Generator Module

Generates e-commerce & SEO-optimized:
1. Product / Meta Title: arranged as [BRAND], [MODEL CODE], [MODEL PARTS NAME]
   (e.g., YAMAHA, BGPK, CYLINDER HEAD)
2. Meta Short Description: arranged in the same sequence with INDIA SPARE at the end
   (e.g., YAMAHA, BGPK, CYLINDER HEAD, INDIA SPARE)
3. Meta Long Description: strictly 120-140 characters describing the genuine OEM part,
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


def build_long_description(
    brand: str,
    model_code: str,
    part_name: str,
    model: str = "",
    series: str = "series",
) -> str:
    """Build a rich, natural long description strictly bounded between 120 and 140 characters."""
    b = (brand or "YAMAHA").strip().upper()
    mc = (model_code or "MODEL").strip().upper()
    mn = (model or "").strip()
    ser = (series or "series").strip()
    p = (part_name or "PARTS").strip().upper()

    m_disp = f"{mn} {mc}".strip() if mn else mc

    # Ordered candidate sentences designed for various part name lengths
    candidates = [
        f"Genuine {b} {m_disp} {ser} {p} assembly part. High quality OEM replacement diagram illustration by INDIA SPARE for your vehicle.",
        f"Genuine {b} {m_disp} {ser} {p} part. High quality OEM replacement diagram illustration by INDIA SPARE for your vehicle.",
        f"Buy genuine {b} {m_disp} {ser} {p} spare parts from INDIA SPARE. 100% authentic OEM replacement diagram with guaranteed fit.",
        f"Authentic {b} {m_disp} {ser} {p} spare part from INDIA SPARE. Genuine OEM factory specification diagram with perfect fit.",
        f"Original {b} {m_disp} {ser} {p} replacement component. Authentic OEM diagram by INDIA SPARE with guaranteed fitment.",
        f"{b} {m_disp} {ser} {p} genuine spare part by INDIA SPARE. Premium OEM factory standard replacement diagram for your vehicle.",
        f"{b} {m_disp} {ser} {p} spare from INDIA SPARE. Direct OEM factory replacement diagram with verified vehicle fitment.",
        f"Genuine {b} {m_disp} {ser} {p} diagram spare by INDIA SPARE. High quality OEM replacement with guaranteed factory fitment.",
        f"Authentic OEM {b} {m_disp} {ser} {p} diagram spare part from INDIA SPARE. Factory standard replacement with guaranteed fitment.",
        f"Buy authentic {b} {m_disp} {ser} {p} diagram parts from INDIA SPARE. Direct factory replacement with guaranteed durability.",
        f"Authentic {b} {m_disp} {ser} {p} diagram part from INDIA SPARE. Genuine factory replacement with guaranteed fit.",
        f"Genuine {b} {m_disp} {ser} {p} diagram by INDIA SPARE. Authentic factory replacement with guaranteed OEM fit.",
        f"Genuine {b} {m_disp} {ser} {p} replacement part by INDIA SPARE with authentic factory specifications.",
        f"{b} {m_disp} {ser} {p} spare from INDIA SPARE with guaranteed OEM fitment.",
    ]

    for c in candidates:
        if 120 <= len(c) <= 140:
            return c

    # Fallback algorithmic bounded synthesis
    base = f"Genuine {b} {m_disp} {ser} {p} spare part by INDIA SPARE. Authentic factory replacement diagram with verified fitment and OEM durability."
    if len(base) > 140:
        cut = base[:139]
        last_space = cut.rfind(" ")
        if last_space >= 119:
            return cut[:last_space].rstrip(" ,;:-") + "."
        base = f"Genuine {b} {m_disp} {ser} {p} diagram by INDIA SPARE. Authentic factory replacement with guaranteed OEM fit."
        if 120 <= len(base) <= 140:
            return base

    while len(base) < 120:
        base = base.rstrip(".") + " for your vehicle."
        if len(base) > 140:
            base = base[:139].rstrip(" ,;:-") + "."
            break

    # Absolute clamp assurance
    if len(base) > 140:
        base = base[:139].rstrip(" ,;:-") + "."
    elif len(base) < 120:
        base = base.ljust(120, " ")

    return base


def generate_main_part_metadata(
    figure: dict[str, Any],
    model_code: str,
    brand: str = "YAMAHA",
    model: str = "",
    series: str = "series",
    page: int = 1,
) -> dict[str, Any]:
    """Generate SEO metadata for a single main part (Figure Assembly)."""
    fig_no = str(figure.get("fig_no") or "").strip()
    part_name = str(figure.get("fig_name") or "").strip() or "PARTS ASSEMBLY"
    b = (brand or "YAMAHA").strip().upper()
    mc = (model_code or "MODEL").strip().upper()
    mn = (model or "").strip()
    ser = (series or "series").strip()
    p = page or int(figure.get("first_page") or figure.get("page") or 1)

    # Model display in title and description:
    # If model is blank, sequence is: BRAND, MODEL CODE, PARTS NAME
    # If model is filled, sequence is: BRAND, MODEL MODEL_CODE, PARTS NAME
    if mn:
        model_str = f"{mn.upper()} {mc}"
    else:
        model_str = mc

    # 1. Product / Meta Title: sequence ex- YAMAHA,MODEL CODE,MODEL PARTS NAME
    title = f"{b}, {model_str}, {part_name}"

    # 2. Meta Short Description: same sequence but after parts name INDIA SPARE
    short_desc = f"{b}, {model_str}, {part_name}, INDIA SPARE"

    # 3. Meta Long Description: strictly 120-140 characters
    long_desc = build_long_description(
        brand=b,
        model_code=mc,
        part_name=part_name,
        model=mn,
        series=ser,
    )

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
        "product_title": title,
        "meta_short_description": short_desc,
        "meta_long_description": long_desc,
        "long_desc_length": len(long_desc),
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
    """Generate SEO metadata for an individual child part row (fallback mode)."""
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

    model_str = f"{mn.upper()} {mc}" if mn else mc
    full_part_name = f"{desc} ({fig_name})"

    title = f"{b}, {model_str}, {full_part_name}"
    short_desc = f"{b}, {model_str}, {full_part_name}, INDIA SPARE"
    long_desc = build_long_description(b, mc, desc, mn, ser)
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
        "product_title": title,
        "meta_short_description": short_desc,
        "meta_long_description": long_desc,
        "long_desc_length": len(long_desc),
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
        # Determine main parts from figures list or derive unique figures from rows
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
        # Generate metadata for every individual child part row
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
        ("Product / Meta Title", "product_title", wrap_left_align, 40),
        ("Meta Short Description", "meta_short_description", wrap_left_align, 46),
        ("Meta Long Description (120-140 chars)", "meta_long_description", wrap_left_align, 65),
        ("Long Desc Chars", "long_desc_length", center_align, 14),
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
        "Product / Meta Title",
        "Meta Short Description",
        "Meta Long Description",
        "Long Desc Chars",
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
            r.get("meta_short_description", ""),
            r.get("meta_long_description", ""),
            r.get("long_desc_length", len(r.get("meta_long_description", ""))),
            r.get("page", 1),
        ])

    out = io.BytesIO(buf.getvalue().encode("utf-8-sig"))
    out.seek(0)
    return out
