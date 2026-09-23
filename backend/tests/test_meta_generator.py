"""Tests for Product & Parts SEO Metadata Generator Module"""

import io
import openpyxl
import pytest

from app.meta_generator import (
    build_long_description,
    generate_main_part_metadata,
    generate_catalog_metadata,
    export_metadata_excel,
    export_metadata_csv,
    resolve_image_filename,
)


def test_resolve_image_filename():
    img_name = resolve_image_filename("CYLINDER HEAD", model_code="BGPK")
    assert img_name == "YAM_BGPK_CYLINDER HEAD.jpeg"


def test_long_description_character_length_bounds():
    """Verify all long descriptions strictly comply with 120-140 characters."""
    sample_parts = [
        "CYLINDER HEAD",
        "CRANKSHAFT & PISTON",
        "VALVE",
        "AIR SHROUD & FAN",
        "OIL PUMP",
        "INTAKE",
        "EXHAUST",
        "CRANKCASE",
        "CRANKCASE COVER 1",
        "STARTER CLUTCH",
        "CLUTCH",
        "TRANSMISSION",
        "FRAME & SUBFRAME MOUNTING HARDWARE",
    ]

    for part in sample_parts:
        desc = build_long_description(
            brand="YAMAHA",
            model_code="BGPK",
            part_name=part,
            model="",
            series="series",
        )
        assert 120 <= len(desc) <= 140, f"Part '{part}' desc length {len(desc)} out of [120, 140] bounds: {desc}"


def test_generate_main_part_metadata():
    """Verify title, short desc, and long desc sequences for main parts."""
    figure = {"fig_no": "1", "fig_name": "CYLINDER HEAD", "first_page": 7}
    meta = generate_main_part_metadata(
        figure=figure,
        model_code="BGPK",
        brand="YAMAHA",
        model="",
        series="series",
    )

    # 1. Product Title sequence: YAMAHA,MODEL CODE,MODEL PARTS NAME
    assert meta["product_title"] == "YAMAHA, BGPK, CYLINDER HEAD"

    # 2. Short description sequence: same sequence but after parts name INDIA SPARE
    assert meta["meta_short_description"] == "YAMAHA, BGPK, CYLINDER HEAD, INDIA SPARE"

    # 3. Long description: 120-140 characters
    assert 120 <= len(meta["meta_long_description"]) <= 140
    assert "YAMAHA" in meta["meta_long_description"]
    assert "BGPK" in meta["meta_long_description"]
    assert "INDIA SPARE" in meta["meta_long_description"]

    # 4. Image filename
    assert meta["image_filename"] == "YAM_BGPK_CYLINDER HEAD.jpeg"
    assert meta["brand"] == "YAMAHA"
    assert meta["model"] == ""
    assert meta["series"] == "series"


def test_generate_main_part_with_custom_model_and_series():
    """Verify custom model name and series are included in title and description."""
    figure = {"fig_no": "2", "fig_name": "CRANKSHAFT & PISTON", "first_page": 8}
    meta = generate_main_part_metadata(
        figure=figure,
        model_code="BGPK",
        brand="YAMAHA",
        model="RAY ZR",
        series="STREET RALLY",
    )

    # Title with model
    assert meta["product_title"] == "YAMAHA, RAY ZR BGPK, CRANKSHAFT & PISTON"

    # Short desc with model and INDIA SPARE
    assert meta["meta_short_description"] == "YAMAHA, RAY ZR BGPK, CRANKSHAFT & PISTON, INDIA SPARE"

    # Long desc within 120-140 chars
    assert 120 <= len(meta["meta_long_description"]) <= 140
    assert "RAY ZR BGPK" in meta["meta_long_description"]
    assert "INDIA SPARE" in meta["meta_long_description"]


def test_main_parts_only_catalog_extraction():
    """Verify catalog metadata contains ONLY the main parts (figures), not child parts."""
    rows = [
        {"fig_no": "1", "fig_name": "CYLINDER HEAD", "ref_no": "1", "part_no": "BGP-E1111-00", "description": "HEAD, CYLINDER 1", "page": 7},
        {"fig_no": "1", "fig_name": "CYLINDER HEAD", "ref_no": "2", "part_no": "90430-06817", "description": "GASKET", "page": 7},
        {"fig_no": "1", "fig_name": "CYLINDER HEAD", "ref_no": "3", "part_no": "95022-06010", "description": "BOLT, FLANGE", "page": 7},
        {"fig_no": "2", "fig_name": "CRANKSHAFT & PISTON", "ref_no": "1", "part_no": "BGP-E1400-00", "description": "CRANKSHAFT ASSY", "page": 8},
        {"fig_no": "2", "fig_name": "CRANKSHAFT & PISTON", "ref_no": "2", "part_no": "BGP-E1631-00", "description": "PISTON", "page": 8},
    ]

    # In main_parts_only mode, exactly 2 main parts (CYLINDER HEAD and CRANKSHAFT & PISTON) should be generated
    meta_items = generate_catalog_metadata(
        rows=rows,
        model_columns=["BGPK"],
        brand="YAMAHA",
        model="",
        series="series",
        model_code="BGPK",
        main_parts_only=True,
    )

    assert len(meta_items) == 2
    assert meta_items[0]["part_name"] == "CYLINDER HEAD"
    assert meta_items[0]["product_title"] == "YAMAHA, BGPK, CYLINDER HEAD"
    assert meta_items[0]["meta_short_description"] == "YAMAHA, BGPK, CYLINDER HEAD, INDIA SPARE"
    assert 120 <= len(meta_items[0]["meta_long_description"]) <= 140

    assert meta_items[1]["part_name"] == "CRANKSHAFT & PISTON"
    assert meta_items[1]["product_title"] == "YAMAHA, BGPK, CRANKSHAFT & PISTON"
    assert meta_items[1]["meta_short_description"] == "YAMAHA, BGPK, CRANKSHAFT & PISTON, INDIA SPARE"
    assert 120 <= len(meta_items[1]["meta_long_description"]) <= 140


def test_export_metadata_excel_and_csv():
    meta_items = [
        {
            "fig_no": "1",
            "part_name": "CYLINDER HEAD",
            "brand": "YAMAHA",
            "model_code": "BGPK",
            "model": "",
            "series": "series",
            "image_filename": "YAM_BGPK_CYLINDER HEAD.jpeg",
            "product_title": "YAMAHA, BGPK, CYLINDER HEAD",
            "meta_short_description": "YAMAHA, BGPK, CYLINDER HEAD, INDIA SPARE",
            "meta_long_description": "Genuine YAMAHA BGPK series CYLINDER HEAD assembly part. High quality OEM replacement diagram illustration by INDIA SPARE for your vehicle.",
            "long_desc_length": 138,
            "page": 7,
        }
    ]

    # Test Excel generation
    xlsx_buf = export_metadata_excel(meta_items, brand="YAMAHA")
    assert xlsx_buf.getbuffer().nbytes > 0
    wb = openpyxl.load_workbook(xlsx_buf)
    ws = wb.active
    assert ws.title == "Product Metadata"
    assert ws.cell(row=1, column=1).value == "Fig No."
    assert ws.cell(row=1, column=2).value == "Main Part Name"
    assert ws.cell(row=2, column=1).value == "1"
    assert ws.cell(row=2, column=2).value == "CYLINDER HEAD"
    assert ws.cell(row=2, column=7).value == "YAM_BGPK_CYLINDER HEAD.jpeg"
    assert ws.cell(row=2, column=8).value == "YAMAHA, BGPK, CYLINDER HEAD"
    assert ws.cell(row=2, column=9).value == "YAMAHA, BGPK, CYLINDER HEAD, INDIA SPARE"

    # Test CSV generation
    csv_buf = export_metadata_csv(meta_items)
    assert csv_buf.getbuffer().nbytes > 0
    csv_content = csv_buf.getvalue().decode("utf-8-sig")
    assert "Fig No.,Main Part Name,Brand,Model Code" in csv_content
    assert "1,CYLINDER HEAD,YAMAHA,BGPK,,series,YAM_BGPK_CYLINDER HEAD.jpeg" in csv_content
