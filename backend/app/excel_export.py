"""Excel Export Module

Generates professionally formatted .xlsx workbooks from extracted parts catalogue data
using openpyxl according to Yamaha catalogue specifications.
"""

from __future__ import annotations

import io
from typing import Any

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from app.parts_extractor import clean_part_number


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
) -> io.BytesIO:
    """Create an in-memory Excel workbook (.xlsx) from parts rows.

    Filtering rule:
    - If a specific model is being exported (len(model_columns) == 1), rows where that
      model's quantity is blank are excluded along with their remarks.
    - If multiple models exist, rows where all model quantities are blank are excluded.
    """
    # Enforce blank quantity exclusion
    if len(model_columns) == 1:
        target_model = model_columns[0]
        rows = [r for r in rows if is_valid_quantity(r.get(target_model))]
        if sheet_title == "Parts List":
            sheet_title = f"Parts_{target_model}"[:31]
    elif len(model_columns) >= 2:
        rows = [r for r in rows if any(is_valid_quantity(r.get(m)) for m in model_columns)]

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

    # Base columns
    headers = [
        ("Page", "page", center_align),
        ("Fig No.", "fig_no", center_align),
        ("Parts Name", "fig_name", left_align),
        ("Ref No.", "ref_no", center_align),
        ("Part No.", "part_no", left_align),
        ("Description", "description", left_align),
    ]

    # Dynamic model columns
    for model in model_columns:
        headers.append((model, model, center_align))

    # Remarks column
    headers.append(("Remarks", "remarks", left_align))

    # Write header row (Row 1)
    ws.row_dimensions[1].height = 28.0
    for col_idx, (header_label, _, _) in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=header_label)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = header_alignment
        cell.border = thin_border

    # Write data rows
    for row_idx, row_data in enumerate(rows, start=2):
        ws.row_dimensions[row_idx].height = 20.0

        for col_idx, (_, field_key, cell_align) in enumerate(headers, start=1):
            val = row_data.get(field_key, "")

            # Apply clean part number if requested
            if field_key == "part_no" and clean_parts:
                val = clean_part_number(str(val))

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
