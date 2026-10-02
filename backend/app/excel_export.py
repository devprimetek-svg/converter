"""Excel Export Module

Generates professionally formatted .xlsx workbooks from extracted parts catalogue data
using openpyxl according to Yamaha catalogue specifications.
"""

from __future__ import annotations

import io
import re
from typing import Any, Optional

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from app.parts_extractor import clean_part_number, disambiguate_repeated_ref_numbers


def build_catalogue_code(model_code: str, fig_name: str, fig_no: str = "") -> str:
    """Build standardized catalogue code for a figure/assembly parent cell.
    Format: YAM_{MODEL_CODE}_{PARTS NAME} with space between words of parts name.
    e.g. YAM_BGPK_CYLINDER HEAD
    """
    mc = re.sub(r'[^A-Za-z0-9]+', '_', (model_code or "").strip()).strip('_').upper()
    if not mc:
        mc = "MODEL"
    # User rule: between words of parts name inside catalogue code, use space instead of underscore
    fn = re.sub(r'[^A-Za-z0-9]+', ' ', (fig_name or "").strip()).strip().upper()
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


def build_model_name_record(model_code: str, model_name: str, fig_name: str, brand: str = "YAMAHA") -> str:
    """Build the formatted model name record for a parent parts row.
    Format: YAMAHA {MODEL_CODE} {MODEL_NAME} Series {PARTS_NAME}
    e.g.    YAMAHA BJPK FASCINO 125CC DISK Series CYLINDER
    or      YAMAHA BGPJ LCX125 Series CYLINDER HEAD
    """
    mc = (model_code or "MODEL").strip().upper()
    mn = (model_name or "").strip()
    fn = re.sub(r"\s+", " ", (fig_name or "").strip()).upper()
    if not fn:
        fn = "PARTS"
    b = (brand or "YAMAHA").strip().upper()
    if mn:
        clean_mn = mn.strip('"\'').strip()
        return f"{b} {mc} {clean_mn} Series {fn}"
    return f"{b} {mc} Series {fn}"


def detect_brand(val: Any, fallback: str = "YAMAHA") -> str:
    """Detect brand from input string if explicitly present, e.g. YAMAHA or YAHAMA."""
    if val is None:
        return fallback
    s = str(val)
    if re.search(r"\bYAHAMA\b", s, flags=re.IGNORECASE):
        return "YAHAMA"
    if re.search(r"\bYAMAHA\b", s, flags=re.IGNORECASE):
        return "YAMAHA"
    return fallback


def extract_raw_model_name(val: Any, model_code: str = "") -> str:
    """Extract only the vehicle/product model portion from a model name string.
    Strips brand (YAMAHA/YAHAMA), model_code, 'Series', and figure heading.
    Also strips surrounding quotes if present.

    Examples:
      'YAHAMA BJPK "FASCINO 125CC DISK" Series CYLINDER' -> 'FASCINO 125CC DISK'
      'YAMAHA BJPK FASCINO 125CC DISK Series CYLINDER'   -> 'FASCINO 125CC DISK'
      '"FASCINO 125CC DISK"'                             -> 'FASCINO 125CC DISK'
      'FASCINO 125CC DISK'                               -> 'FASCINO 125CC DISK'
      'YAMAHA BJPK Series CYLINDER'                      -> ''
      'FZ-S FI'                                          -> 'FZ-S FI'
    """
    if val is None:
        return ""
    s = str(val).strip()
    if not s:
        return ""

    # 1. If it contains 'Series', take everything before 'Series'
    series_match = re.search(r"\bSeries\b", s, flags=re.IGNORECASE)
    if series_match:
        s = s[: series_match.start()].strip()

    # 2. Strip leading Brand: YAMAHA or YAHAMA
    s = re.sub(r"^(?:YAMAHA|YAHAMA)\s+", "", s, flags=re.IGNORECASE).strip()

    # 3. Strip leading model_code if provided
    if model_code:
        mc = re.escape(model_code.strip())
        s = re.sub(rf"^{mc}(?:\s+|$)", "", s, flags=re.IGNORECASE).strip()

    # Also strip any 4-char alphanumeric code followed by the model name (e.g. if code was different)
    s = re.sub(r"^[A-Z0-9]{4}\s+(?=[\"A-Za-z0-9])", "", s).strip()

    # 4. Strip surrounding quotes if present so user model is clean
    s = s.strip('"\'').strip()

    return s.strip()


def format_parent_model_name(
    val: Any,
    model_code: str = "MODEL",
    fig_name: str = "PARTS",
    brand: str = "YAMAHA",
) -> str:
    """Format the parent row model name to standard:
    YAMAHA {MODEL_CODE} {USER_MODEL} Series {PARTS_NAME}
    or YAMAHA {MODEL_CODE} Series {PARTS_NAME} if no user model.
    """
    raw_model = extract_raw_model_name(val, model_code)
    b = detect_brand(val, brand or "YAMAHA").strip().upper()
    mc = (model_code or "MODEL").strip().upper()
    fn = re.sub(r"\s+", " ", (fig_name or "").strip()).upper()
    if not fn:
        fn = "PARTS"
    if raw_model:
        clean_model = raw_model.strip('"\'').strip()
        return f"{b} {mc} {clean_model} Series {fn}"
    return f"{b} {mc} Series {fn}"


def is_valid_quantity(val: Any) -> bool:
    """Return True if quantity is non-empty, non-zero, and not a blank placeholder."""
    if val is None:
        return False
    s = str(val).strip()
    if not s:
        return False
    if s.lower() in ("-", "none", "null", "0", "*"):
        return False
    return True


def generate_excel_workbook(
    rows: list[dict[str, Any]],
    model_columns: list[str],
    clean_parts: bool = False,
    sheet_title: str = "Parts List",
    model_code: Optional[str] = None,
) -> io.BytesIO:
    """Create an in-memory Excel workbook (.xlsx) from parts rows.

    Filtering rule:
    - If a specific model is being exported (len(model_columns) == 1), rows where that
      model's quantity is blank are excluded along with their remarks.
    - If multiple models exist, rows where all model quantities are blank are excluded.

    Parent cell rule:
    - For the figure number, parts name, and catalogue code, only the parent cell of the figure
      contains the value. Child rows under the same figure remain blank.
    - An extra 'Catalogue Code' column is added immediately after 'Parts Name'.
    """
    # Enforce blank quantity exclusion
    if len(model_columns) == 1:
        target_model = model_columns[0]
        rows = [r for r in rows if is_valid_quantity(r.get(target_model))]
        if sheet_title == "Parts List":
            sheet_title = f"Parts_{target_model}"[:31]
    elif len(model_columns) >= 2:
        rows = [r for r in rows if any(is_valid_quantity(r.get(m)) for m in model_columns)]

    # Disambiguate repeated ref_no within each figure (e.g. 1A, 1B, 2A, 2B etc.)
    rows = disambiguate_repeated_ref_numbers(rows)

    # Determine active model code for catalogue code generation
    active_model_code = (model_code or "").strip().upper()
    if not active_model_code:
        if len(model_columns) == 1:
            active_model_code = model_columns[0].strip().upper()
        elif len(model_columns) > 1:
            # Check if any row specifies a primary model_code
            for r in rows:
                if r.get("model_code"):
                    active_model_code = str(r["model_code"]).strip().upper()
                    break
            if not active_model_code:
                active_model_code = "_".join(m.strip().upper() for m in model_columns if m.strip())
        else:
            active_model_code = "MODEL"

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = sheet_title[:31]

    # Header styling
    header_fill = PatternFill(start_color="1B365D", end_color="1B365D", fill_type="solid")  # Yamaha Navy Blue
    header_font = Font(name="Arial", size=11, bold=True, color="FFFFFF")
    header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    # Data styling
    data_font = Font(name="Arial", size=10)
    center_align = Alignment(horizontal="center", vertical="center")
    left_align = Alignment(horizontal="left", vertical="center")
    right_align = Alignment(horizontal="right", vertical="center")

    thin_border_side = Side(style="thin", color="D3D3D3")
    thin_border = Border(
        left=thin_border_side,
        right=thin_border_side,
        top=thin_border_side,
        bottom=thin_border_side,
    )

    # Base columns: Catalogue Code placed after Parts Name, Pic (parent image record) placed before Ref No.
    headers = [
        ("Page", "page", center_align),
        ("Fig No.", "fig_no", center_align),
        ("Parts Name", "fig_name", left_align),
        ("Catalogue Code", "catalogue_code", left_align),
        ("Model Name", "model_name", left_align),
        ("Pic", "pic", left_align),
        ("Ref No.", "ref_no", center_align),
        ("Part No.", "part_no", left_align),
        ("Description", "description", left_align),
    ]

    # Dynamic model columns
    for model in model_columns:
        headers.append((model, model, center_align))

    # Remarks column
    headers.append(("Remarks", "remarks", left_align))

    # Optional ERP Master & Warehouse columns (Phase 2 & Phase 4)
    has_erp_fields = any(
        any(r.get(k) is not None and str(r.get(k)).strip() != "" for k in ("hsn_code", "gst_rate", "mrp", "cost_price", "dealer_price", "rack_bin"))
        for r in rows
    )
    if has_erp_fields:
        headers.extend([
            ("HSN Code", "hsn_code", center_align),
            ("GST Rate (%)", "gst_rate", right_align),
            ("MRP (INR)", "mrp", right_align),
            ("Purchase Price (INR)", "cost_price", right_align),
            ("Dealer Price (INR)", "dealer_price", right_align),
            ("Rack / Bin", "rack_bin", center_align),
        ])

    # Write header row (Row 1)
    ws.row_dimensions[1].height = 28.0
    for col_idx, (header_label, _, _) in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=header_label)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = header_alignment
        cell.border = thin_border

    # Write data rows
    last_fig_key = None

    for row_idx, row_data in enumerate(rows, start=2):
        ws.row_dimensions[row_idx].height = 20.0

        # Identify figure grouping key
        raw_fig_no = str(row_data.get("parent_fig_no") or row_data.get("fig_no") or "").strip()
        raw_fig_name = str(row_data.get("parent_fig_name") or row_data.get("fig_name") or "").strip()
        if raw_fig_no or raw_fig_name:
            fig_key = (raw_fig_no, raw_fig_name)
        else:
            fig_key = ("page", str(row_data.get("page", "")))

        row_model_code = str(row_data.get("model_code") or "").strip().upper() or active_model_code
        is_parent_cell = (fig_key != last_fig_key)
        if is_parent_cell:
            last_fig_key = fig_key
            curr_page = str(row_data.get("page", ""))
            curr_fig_no = raw_fig_no
            curr_fig_name = raw_fig_name
            curr_cat_code = row_data.get("catalogue_code") or build_catalogue_code(row_model_code, raw_fig_name, raw_fig_no)
            curr_pic = row_data.get("pic") or row_data.get("image") or (f"{curr_cat_code}.jpeg" if curr_cat_code else "")
            # Model name: format parent model name standard record
            raw_mn = str(row_data.get("model_name") or "").strip()
            curr_model_name = format_parent_model_name(raw_mn, row_model_code, raw_fig_name)
        else:
            # Child cell: page, fig_no, fig_name, catalogue_code, model_name, and pic do NOT repeat — remain blank
            curr_page = ""
            curr_fig_no = ""
            curr_fig_name = ""
            curr_cat_code = ""
            curr_model_name = ""
            curr_pic = ""

        for col_idx, (_, field_key, cell_align) in enumerate(headers, start=1):
            if field_key == "page":
                val = curr_page
            elif field_key == "fig_no":
                val = curr_fig_no
            elif field_key == "fig_name":
                val = curr_fig_name
            elif field_key == "catalogue_code":
                val = curr_cat_code
            elif field_key == "model_name":
                val = curr_model_name
            elif field_key in ("pic", "image"):
                val = curr_pic
            elif field_key == "part_no":
                val = row_data.get("part_no", "")
                if clean_parts:
                    val = clean_part_number(str(val))
            elif field_key in ("mrp", "cost_price", "dealer_price"):
                val = row_data.get(field_key)
                if val is not None and str(val).strip() != "":
                    try:
                        num_val = float(str(val).replace(",", "").replace("₹", "").strip())
                        cell = ws.cell(row=row_idx, column=col_idx, value=num_val)
                        cell.font = data_font
                        cell.alignment = cell_align
                        cell.border = thin_border
                        cell.number_format = "#,##0.00"
                        continue
                    except ValueError:
                        pass
            elif field_key == "gst_rate":
                val = row_data.get(field_key)
                if val is not None and str(val).strip() != "":
                    try:
                        num_val = float(str(val).replace("%", "").strip())
                        cell = ws.cell(row=row_idx, column=col_idx, value=num_val)
                        cell.font = data_font
                        cell.alignment = cell_align
                        cell.border = thin_border
                        cell.number_format = "0.00"
                        continue
                    except ValueError:
                        pass
            else:
                val = row_data.get(field_key, "")

            cell = ws.cell(row=row_idx, column=col_idx, value=str(val) if val is not None else "")
            cell.font = data_font
            cell.alignment = cell_align
            cell.border = thin_border
            # Enforce string data type so leading zeros aren't stripped
            cell.number_format = "@"

    # Freeze header row
    ws.freeze_panes = "A2"

    # Enable Autofilter
    if rows:
        max_col_letter = get_column_letter(len(headers))
        ws.auto_filter.ref = f"A1:{max_col_letter}{len(rows) + 1}"

    # Calculate sensible auto-fit column widths
    for col_idx, (header_label, _, _) in enumerate(headers, start=1):
        col_letter = get_column_letter(col_idx)
        max_len = len(header_label)

        for row_idx in range(2, min(len(rows) + 2, 200)):  # sample up to 200 rows for speed
            cell_val = str(ws.cell(row=row_idx, column=col_idx).value or "")
            if len(cell_val) > max_len:
                max_len = len(cell_val)

        # Add buffer padding and clamp between min and max
        col_width = max(max_len + 4, 10)
        col_width = min(col_width, 48)  # max width cap
        ws.column_dimensions[col_letter].width = col_width

    # Save to memory buffer
    output_stream = io.BytesIO()
    wb.save(output_stream)
    output_stream.seek(0)
    return output_stream
