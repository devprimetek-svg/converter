"""Tests for Product & Parts SEO Metadata Generator Module"""

import io
import openpyxl
import pytest

from app.meta_generator import (
    generate_part_metadata,
    generate_catalog_metadata,
    export_metadata_excel,
    export_metadata_csv,
    resolve_image_filename,
)


def test_resolve_image_filename():
    row = {"fig_name": "CYLINDER HEAD", "fig_no": "1"}
    img_name = resolve_image_filename(row, model_code="BGPK")
    assert img_name == "YAM_BGPK_CYLINDER HEAD.jpeg"


def test_generate_part_metadata_ecommerce():
    row = {
        "page": 2,
        "fig_no": "1",
        "fig_name": "CYLINDER HEAD",
        "ref_no": "1",
        "part_no": "BGP-E1111-00",
        "description": "HEAD, CYLINDER 1",
        "remarks": "UR FOR SILVER",
        "BGPK": "1",
    }
    meta = generate_part_metadata(
        row=row,
        model_columns=["BGPK"],
        brand="Yamaha",
        style="ecommerce",
        model_code="BGPK",
    )

    assert meta["part_no"] == "BGP-E1111-00"
    assert meta["clean_part_no"] == "BGPE11110000"
    assert meta["image_filename"] == "YAM_BGPK_CYLINDER HEAD.jpeg"
    assert "Yamaha HEAD, CYLINDER 1" in meta["product_title"]
    assert "BGPE11110000" in meta["product_title"]
    assert "Ref #1" in meta["product_title"]
    assert "CYLINDER HEAD" in meta["product_title"]

    # Check meta short description length and content
    assert "HEAD, CYLINDER 1" in meta["meta_short_description"]
    assert "CYLINDER HEAD" in meta["meta_short_description"]
    assert len(meta["meta_short_description"]) <= 200

    # Check meta long description contains structured HTML tags
    assert "<div class=\"oem-part-description\">" in meta["meta_long_description"]
    assert "YAM_BGPK_CYLINDER HEAD.jpeg" in meta["meta_long_description"]
    assert "Ref #1" in meta["meta_long_description"]
    assert "UR FOR SILVER" in meta["meta_long_description"]


def test_generate_part_metadata_custom_templates():
    row = {
        "page": 5,
        "fig_no": "3",
        "fig_name": "CRANKSHAFT",
        "ref_no": "4",
        "part_no": "93306-205YC",
        "description": "BEARING",
        "BGPK": "2",
    }
    custom_templates = {
        "title": "OEM {brand} {description} [{clean_part_no}] {fig_name}",
        "short_description": "Buy {brand} {part_no} for {fig_name} ({models}).",
        "long_description": "Part: {description} | Image: {image_filename}",
    }
    meta = generate_part_metadata(
        row=row,
        model_columns=["BGPK"],
        brand="Yamaha",
        custom_templates=custom_templates,
        model_code="BGPK",
    )

    assert meta["product_title"] == "OEM Yamaha BEARING [93306205YC00] CRANKSHAFT"
    assert meta["meta_short_description"] == "Buy Yamaha 93306-205YC for CRANKSHAFT (BGPK (Qty: 2))."
    assert meta["meta_long_description"] == "Part: BEARING | Image: YAM_BGPK_CRANKSHAFT.jpeg"


def test_export_metadata_excel_and_csv():
    rows = [
        {
            "page": 2,
            "fig_no": "1",
            "fig_name": "CYLINDER HEAD",
            "ref_no": "1",
            "part_no": "BGP-E1111-00",
            "description": "HEAD, CYLINDER 1",
            "remarks": "",
            "BGPK": "1",
        },
        {
            "page": 2,
            "fig_no": "1",
            "fig_name": "CYLINDER HEAD",
            "ref_no": "2",
            "part_no": "BGP-E1181-00",
            "description": "GASKET, CYLINDER HEAD 1",
            "remarks": "",
            "BGPK": "1",
        },
    ]

    meta_items = generate_catalog_metadata(
        rows=rows,
        model_columns=["BGPK"],
        brand="Yamaha",
        model_code="BGPK",
    )
    assert len(meta_items) == 2

    # Test Excel generation
    xlsx_buf = export_metadata_excel(meta_items, brand="Yamaha")
    assert xlsx_buf.getbuffer().nbytes > 0
    wb = openpyxl.load_workbook(xlsx_buf)
    ws = wb.active
    assert ws.title == "Product Metadata"
    assert ws.cell(row=1, column=1).value == "Part No."
    assert ws.cell(row=2, column=1).value == "BGP-E1111-00"
    assert ws.cell(row=2, column=2).value == "BGPE11110000"
    assert "YAM_BGPK_CYLINDER HEAD.jpeg" in ws.cell(row=2, column=7).value

    # Test CSV generation
    csv_buf = export_metadata_csv(meta_items)
    assert csv_buf.getbuffer().nbytes > 0
    csv_content = csv_buf.getvalue().decode("utf-8-sig")
    assert "Part No.,Clean Part No.,Part Description" in csv_content
    assert "BGP-E1111-00,BGPE11110000,\"HEAD, CYLINDER 1\"" in csv_content
