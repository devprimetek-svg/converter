"""Product & Parts SEO Metadata Generator Module

Generates e-commerce & SEO-optimized:
1. Product / Meta Title
2. Meta Short Description (150-160 chars)
3. Meta Long Description (Structured HTML / Markdown / Plain text)
based on individual part names, part numbers, figure illustrations, reference numbers,
and model code compatibility extracted from Yamaha parts catalogues.
"""

from __future__ import annotations

import csv
import html
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


def resolve_image_filename(row: dict[str, Any], model_code: str = "") -> str:
    """Resolve the associated diagram image filename for a part row.
    Matches the naming standard: YAM_{MODEL_CODE}_{CLEAN_FIG_NAME}.jpeg
    """
    fig_name = str(row.get("fig_name") or "").strip()
    clean_fig = sanitize_filename_segment(fig_name) or "DIAGRAM"
    model = sanitize_filename_segment(model_code).strip() or "MODEL"
    return f"YAM_{model}_{clean_fig}.jpeg"


def get_compatible_models_str(row: dict[str, Any], model_columns: list[str]) -> str:
    """Return a human-readable list of compatible model codes with quantities."""
    compat: list[str] = []
    for model in model_columns:
        val = str(row.get(model) or "").strip()
        if val and val not in ("-", "0", "*", "None", "null"):
            compat.append(f"{model} (Qty: {val})")
        elif val:
            compat.append(model)
    return ", ".join(compat) if compat else ("General Fitment" if not model_columns else model_columns[0])


def clean_description(desc: str) -> str:
    """Clean and standardize description text (e.g. 'HEAD, CYLINDER 1' -> title cased or clean uppercase)."""
    if not desc:
        return "Part Component"
    return desc.strip()


def generate_part_metadata(
    row: dict[str, Any],
    model_columns: list[str],
    brand: str = "Yamaha",
    style: str = "ecommerce",
    custom_templates: Optional[dict[str, str]] = None,
    model_code: str = "",
) -> dict[str, Any]:
    """Generate SEO and e-commerce metadata for an individual part row."""
    part_no = str(row.get("part_no") or "").strip()
    clean_no = clean_part_number(part_no)
    desc = clean_description(str(row.get("description") or ""))
    fig_name = str(row.get("fig_name") or "").strip() or "General Assembly"
    fig_no = str(row.get("fig_no") or "").strip()
    ref_no = str(row.get("ref_no") or "").strip()
    remarks = str(row.get("remarks") or "").strip()
    page = int(row.get("page") or 1)

    # Determine primary model code for diagram image filename
    if not model_code:
        if model_columns:
            model_code = "_".join(str(m).strip() for m in model_columns if str(m).strip())
        else:
            model_code = "MODEL"

    img_filename = resolve_image_filename(row, model_code=model_code)
    compat_str = get_compatible_models_str(row, model_columns)
    simple_models = ", ".join(model_columns) if model_columns else model_code

    # Variables dict for custom formatting
    context = {
        "brand": brand,
        "part_no": part_no,
        "clean_part_no": clean_no,
        "description": desc,
        "fig_name": fig_name,
        "fig_no": fig_no,
        "ref_no": ref_no,
        "models": compat_str,
        "model_code": model_code,
        "simple_models": simple_models,
        "image_filename": img_filename,
        "remarks": remarks,
        "page": str(page),
    }

    # 1. Product / Meta Title
    if custom_templates and custom_templates.get("title"):
        title = format_template(custom_templates["title"], context)
    elif style == "marketplace":
        # Amazon / eBay dense keyword style
        ref_text = f"Ref #{ref_no}" if ref_no else ""
        parts = [p for p in [f"{brand} {desc}", clean_no or part_no, ref_text, fig_name, f"Fits {simple_models}"] if p]
        title = " - ".join(parts)
    elif style == "minimalist":
        # Minimal clean title
        title = f"{desc} | {clean_no or part_no} ({brand})"
    else:
        # Default E-Commerce (Shopify / WooCommerce)
        ref_text = f"Ref #{ref_no}, " if ref_no else ""
        fits_text = f" | Fits {simple_models}" if simple_models and simple_models != "MODEL" else ""
        title = f"{brand} {desc} - {clean_no or part_no} ({ref_text}{fig_name}){fits_text}"

    # 2. Meta Short Description (Target ~150-160 characters for optimal Google SEO SERP snippet)
    if custom_templates and custom_templates.get("short_description"):
        short_desc = format_template(custom_templates["short_description"], context)
    elif style == "marketplace":
        short_desc = (
            f"Genuine {brand} {desc} (Part #{clean_no or part_no}). "
            f"Figure {fig_no} Ref #{ref_no} in {fig_name} diagram. "
            f"Fits {simple_models}. Fast shipping & guaranteed fit."
        )
    elif style == "minimalist":
        short_desc = f"{brand} OEM {desc} (Part #{clean_no or part_no}). Fits {fig_name} on {simple_models}."
    else:
        # E-commerce SEO snippet
        short_desc = (
            f"Genuine OEM {brand} {desc} (Part #{clean_no or part_no}, Ref #{ref_no}) "
            f"for {fig_name} assembly. Fits {simple_models}. 100% authentic factory replacement."
        )

    # Clean short desc whitespace
    short_desc = re.sub(r"\s+", " ", short_desc).strip()

    # 3. Meta Long Description (Structured Body)
    if custom_templates and custom_templates.get("long_description"):
        long_desc = format_template(custom_templates["long_description"], context)
    elif style == "minimalist":
        long_desc = (
            f"PRODUCT DETAILS\n"
            f"------------------------\n"
            f"Brand: {brand}\n"
            f"Part Name: {desc}\n"
            f"Part Number: {part_no} (Clean: {clean_no})\n"
            f"Assembly: {fig_name} (Fig #{fig_no}, Ref #{ref_no})\n"
            f"Diagram Image: {img_filename}\n"
            f"Catalogue Page: {page}\n"
            f"Compatible Models: {compat_str}\n"
            + (f"Remarks: {remarks}\n" if remarks else "")
            + f"\nDirect OEM replacement part manufactured to factory tolerances."
        )
    elif style == "marketplace":
        long_desc = (
            f"GENUINE OEM {brand.upper()} REPLACEMENT PART\n\n"
            f"ITEM SPECIFICS:\n"
            f"• Part Name: {desc}\n"
            f"• Manufacturer Part Number: {part_no}\n"
            f"• Clean OEM Reference: {clean_no}\n"
            f"• Diagram Assembly: {fig_name} (Figure #{fig_no})\n"
            f"• Diagram Reference Number: Position #{ref_no}\n"
            f"• Corresponding Diagram Illustration: {img_filename}\n"
            f"• Fitment Models: {compat_str}\n"
            + (f"• Notes / Remarks: {remarks}\n" if remarks else "")
            + f"\nFEATURES & QUALITY ASSURANCE:\n"
            f"• 100% Genuine factory standard component\n"
            f"• Exact dimensional match and reliable OEM durability\n"
            f"• Preserves warranty, performance, and vehicle reliability"
        )
    else:
        # Standard E-Commerce HTML Description (Ideal for Shopify / WooCommerce body_html)
        safe_desc = html.escape(desc)
        safe_brand = html.escape(brand)
        safe_part_no = html.escape(part_no)
        safe_clean_no = html.escape(clean_no)
        safe_fig_name = html.escape(fig_name)
        safe_fig_no = html.escape(fig_no)
        safe_ref_no = html.escape(ref_no)
        safe_compat = html.escape(compat_str)
        safe_img = html.escape(img_filename)
        safe_remarks = html.escape(remarks) if remarks else ""

        remarks_html = f"<li><strong>Notes / Remarks:</strong> {safe_remarks}</li>" if safe_remarks else ""

        long_desc = (
            f'<div class="oem-part-description">\n'
            f'  <h3>Product Overview</h3>\n'
            f'  <p>Authentic OEM <strong>{safe_brand} {safe_desc}</strong> (Part Number: <code>{safe_part_no}</code> / Clean: <code>{safe_clean_no}</code>). '
            f'Engineered to strict factory tolerances for precision fit, optimal reliability, and long-lasting durability.</p>\n\n'
            f'  <h3>Parts Diagram & Placement</h3>\n'
            f'  <ul>\n'
            f'    <li><strong>Assembly / Section:</strong> {safe_fig_name} (Figure #{safe_fig_no})</li>\n'
            f'    <li><strong>Diagram Reference:</strong> Ref #{safe_ref_no}</li>\n'
            f'    <li><strong>Associated Illustration File:</strong> <code>{safe_img}</code></li>\n'
            f'    <li><strong>Catalogue Page:</strong> Page {page}</li>\n'
            f'    {remarks_html}\n'
            f'  </ul>\n\n'
            f'  <h3>Vehicle Compatibility</h3>\n'
            f'  <p>Verified fitment for the following model configurations:</p>\n'
            f'  <p><strong>{safe_compat}</strong></p>\n\n'
            f'  <h3>Why Choose Genuine OEM?</h3>\n'
            f'  <ul>\n'
            f'    <li><strong>Guaranteed Fitment:</strong> Direct factory match without modification.</li>\n'
            f'    <li><strong>Original Performance:</strong> Engineered specifically for your vehicle.</li>\n'
            f'    <li><strong>Quality Assured:</strong> Premium factory materials and corrosion resistance.</li>\n'
            f'  </ul>\n'
            f'</div>'
        )

    return {
        "page": page,
        "fig_no": fig_no,
        "fig_name": fig_name,
        "ref_no": ref_no,
        "part_no": part_no,
        "clean_part_no": clean_no,
        "description": desc,
        "compatible_models": compat_str,
        "image_filename": img_filename,
        "product_title": title,
        "meta_short_description": short_desc,
        "meta_long_description": long_desc,
        "remarks": remarks,
    }


def format_template(template_str: str, context: dict[str, str]) -> str:
    """Format template string replacing {variable} placeholders with context values."""
    res = template_str
    for k, v in context.items():
        res = res.replace(f"{{{k}}}", str(v))
    return res


def generate_catalog_metadata(
    rows: list[dict[str, Any]],
    model_columns: list[str],
    brand: str = "Yamaha",
    style: str = "ecommerce",
    custom_templates: Optional[dict[str, str]] = None,
    model_code: str = "",
) -> list[dict[str, Any]]:
    """Generate SEO metadata for an entire list of catalog part rows."""
    results: list[dict[str, Any]] = []
    for r in rows:
        meta_item = generate_part_metadata(
            row=r,
            model_columns=model_columns,
            brand=brand,
            style=style,
            custom_templates=custom_templates,
            model_code=model_code,
        )
        results.append(meta_item)
    return results


def export_metadata_excel(meta_rows: list[dict[str, Any]], brand: str = "Yamaha") -> io.BytesIO:
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
    wrap_left_align = Alignment(horizontal="left", vertical="top", wrap_text=True)

    thin_border_side = Side(style="thin", color="D3D3D3")
    thin_border = Border(
        left=thin_border_side,
        right=thin_border_side,
        top=thin_border_side,
        bottom=thin_border_side,
    )

    headers = [
        ("Part No.", "part_no", left_align, 18),
        ("Clean Part No.", "clean_part_no", left_align, 18),
        ("Part Description", "description", left_align, 28),
        ("Figure Name", "fig_name", left_align, 24),
        ("Fig No.", "fig_no", center_align, 10),
        ("Ref No.", "ref_no", center_align, 10),
        ("Associated Diagram Image", "image_filename", left_align, 32),
        ("Compatible Models", "compatible_models", left_align, 25),
        ("Product Title / Meta Title", "product_title", wrap_left_align, 40),
        ("Meta Short Description", "meta_short_description", wrap_left_align, 45),
        ("Meta Long Description", "meta_long_description", wrap_left_align, 60),
        ("Remarks", "remarks", left_align, 20),
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
        "Part No.",
        "Clean Part No.",
        "Part Description",
        "Figure Name",
        "Fig No.",
        "Ref No.",
        "Associated Diagram Image",
        "Compatible Models",
        "Product Title / Meta Title",
        "Meta Short Description",
        "Meta Long Description",
        "Remarks",
        "Page",
    ]
    writer.writerow(headers)

    for r in meta_rows:
        writer.writerow([
            r.get("part_no", ""),
            r.get("clean_part_no", ""),
            r.get("description", ""),
            r.get("fig_name", ""),
            r.get("fig_no", ""),
            r.get("ref_no", ""),
            r.get("image_filename", ""),
            r.get("compatible_models", ""),
            r.get("product_title", ""),
            r.get("meta_short_description", ""),
            r.get("meta_long_description", ""),
            r.get("remarks", ""),
            r.get("page", 1),
        ])

    out = io.BytesIO(buf.getvalue().encode("utf-8-sig"))  # UTF-8 with BOM for Excel compatibility
    out.seek(0)
    return out
