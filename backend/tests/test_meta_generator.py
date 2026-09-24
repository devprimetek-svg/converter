"""Tests for Product & Parts SEO Metadata Generator Module"""

import io
import openpyxl
import pytest

from app.meta_generator import (
    build_product_title,
    build_meta_title,
    build_meta_short_description,
    build_meta_description,
    build_product_description,
    build_long_description,
    clean_no_commas,
    generate_main_part_metadata,
    generate_catalog_metadata,
    export_metadata_excel,
    export_metadata_csv,
    resolve_image_filename,
)


def test_resolve_image_filename():
    img_name = resolve_image_filename("CYLINDER HEAD", model_code="BGPK")
    assert img_name == "YAM_BGPK_CYLINDER HEAD.jpeg"


def test_no_commas_between_words():
    """Verify clean_no_commas strips all commas and normalizes spacing."""
    assert clean_no_commas("YAMAHA, BGPK, CYLINDER HEAD") == "YAMAHA BGPK CYLINDER HEAD"
    assert clean_no_commas("Hello, world, test, 123") == "Hello world test 123"


def test_product_title_in_caps_separate_from_meta_title_and_no_commas():
    """Verify product title is ALL CAPS, no commas, and meta title is separate (Title Case, no commas)."""
    pt = build_product_title("YAMAHA", "BGPK", "cylinder head", model="ray zr")
    assert pt == "YAMAHA BGPK RAY ZR CYLINDER HEAD"
    assert "," not in pt
    assert pt.isupper()

    mt = build_meta_title("YAMAHA", "BGPK", "cylinder head", model="ray zr")
    assert mt == "Yamaha Ray Zr BGPK Cylinder Head | India Spare"
    assert "," not in mt
    assert mt != pt  # Separate from product title


def test_meta_short_description_no_commas():
    """Verify meta short description ends with INDIA SPARE and has no commas."""
    sd = build_meta_short_description("YAMAHA", "BGPK", "CYLINDER HEAD", model="RAY ZR")
    assert sd == "YAMAHA BGPK RAY ZR CYLINDER HEAD INDIA SPARE"
    assert "," not in sd
    assert sd.endswith("INDIA SPARE")


def test_meta_description_character_length_151_to_158_without_caps_no_commas():
    """Verify meta descriptions are strictly bounded between 151 and 158 characters, without caps, and zero commas."""
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
        for m in ["", "RAY ZR"]:
            desc = build_meta_description(
                brand="Yamaha",
                model_code="BGPK",
                part_name=part,
                model=m,
                series="series",
            )
            assert 151 <= len(desc) <= 158, f"Part '{part}' (m='{m}') desc length {len(desc)} not in [151, 158]: '{desc}'"
            assert "," not in desc, f"Comma found in meta description: '{desc}'"
            assert desc.islower(), f"Meta description must be without caps (all lowercase): '{desc}'"
            assert not any(c.isupper() for c in desc), f"Capital letter found in meta description: '{desc}'"


def test_product_description_words_120_to_140_no_commas():
    """Verify product descriptions are strictly bounded between 120 and 140 words, and zero commas."""
    sample_parts = [
        "CYLINDER HEAD",
        "CRANKSHAFT & PISTON",
        "VALVE",
        "AIR SHROUD & FAN",
        "OIL PUMP",
        "TRANSMISSION",
    ]

    for part in sample_parts:
        for m in ["", "RAY ZR"]:
            pdesc = build_product_description(
                brand="YAMAHA",
                model_code="BGPK",
                part_name=part,
                model=m,
                series="series",
            )
            words = pdesc.split()
            word_count = len(words)
            assert 120 <= word_count <= 140, f"Part '{part}' word count {word_count} not in [120, 140]: '{pdesc}'"
            assert "," not in pdesc, f"Comma found in product description: '{pdesc}'"


def test_generate_main_part_metadata():
    """Verify title in CAPS, separate meta title, short desc, 151-158 char meta desc, 120-140 word prod desc."""
    figure = {"fig_no": "1", "fig_name": "CYLINDER HEAD", "first_page": 7}
    meta = generate_main_part_metadata(
        figure=figure,
        model_code="BGPK",
        brand="YAMAHA",
        model="",
        series="series",
    )

    # 1. Product Title: in ALL CAPS, no commas
    assert meta["product_title"] == "YAMAHA BGPK CYLINDER HEAD"
    assert "," not in meta["product_title"]
    assert meta["product_title"].isupper()

    # 2. Meta Title: separate from product title, Title Case, no commas
    assert meta["meta_title"] == "Yamaha BGPK Cylinder Head | India Spare"
    assert "," not in meta["meta_title"]

    # 3. Meta Short description: removed from entire app
    assert "meta_short_description" not in meta

    # 4. Meta description: strictly 151-158 characters without caps, no commas
    assert 151 <= len(meta["meta_description"]) <= 158
    assert "," not in meta["meta_description"]
    assert meta["meta_description"].islower()
    assert not any(c.isupper() for c in meta["meta_description"])
    assert meta["meta_desc_chars"] == len(meta["meta_description"])

    # 5. Product description: strictly 120-140 words, no commas
    p_words = len(meta["product_description"].split())
    assert 120 <= p_words <= 140
    assert "," not in meta["product_description"]
    assert meta["product_desc_words"] == p_words

    # 6. Image filename & fields
    assert meta["image_filename"] == "YAM_BGPK_CYLINDER HEAD.jpeg"
    assert meta["brand"] == "YAMAHA"
    assert meta["model"] == ""
    assert meta["series"] == "series"


def test_generate_main_part_with_custom_model_and_series():
    """Verify custom model name and series are included in title and descriptions."""
    figure = {"fig_no": "2", "fig_name": "CRANKSHAFT & PISTON", "first_page": 8}
    meta = generate_main_part_metadata(
        figure=figure,
        model_code="BGPK",
        brand="YAMAHA",
        model="RAY ZR",
        series="STREET RALLY",
    )

    # Title with model after model code in ALL CAPS, no commas
    assert meta["product_title"] == "YAMAHA BGPK RAY ZR CRANKSHAFT & PISTON"
    assert "," not in meta["product_title"]

    # Separate Meta Title (model typed before model code)
    assert meta["meta_title"] == "Yamaha Ray Zr BGPK Crankshaft & Piston | India Spare"
    assert "," not in meta["meta_title"]

    # Short desc removed from entire app
    assert "meta_short_description" not in meta

    # Meta desc strictly 151-158 chars without caps, no commas
    assert 151 <= len(meta["meta_description"]) <= 158
    assert "," not in meta["meta_description"]
    assert meta["meta_description"].islower()
    assert not any(c.isupper() for c in meta["meta_description"])

    # Product desc strictly 120-140 words, no commas
    w_count = len(meta["product_description"].split())
    assert 120 <= w_count <= 140
    assert "," not in meta["product_description"]


def test_main_parts_only_catalog_extraction():
    """Verify catalog metadata contains ONLY the main parts (figures), not child parts."""
    rows = [
        {"fig_no": "1", "fig_name": "CYLINDER HEAD", "ref_no": "1", "part_no": "BGP-E1111-00", "description": "HEAD, CYLINDER 1", "page": 7},
        {"fig_no": "1", "fig_name": "CYLINDER HEAD", "ref_no": "2", "part_no": "90430-06817", "description": "GASKET", "page": 7},
        {"fig_no": "1", "fig_name": "CYLINDER HEAD", "ref_no": "3", "part_no": "95022-06010", "description": "BOLT, FLANGE", "page": 7},
        {"fig_no": "2", "fig_name": "CRANKSHAFT & PISTON", "ref_no": "1", "part_no": "BGP-E1400-00", "description": "CRANKSHAFT ASSY", "page": 8},
        {"fig_no": "2", "fig_name": "CRANKSHAFT & PISTON", "ref_no": "2", "part_no": "BGP-E1631-00", "description": "PISTON", "page": 8},
    ]

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
    assert meta_items[0]["product_title"] == "YAMAHA BGPK CYLINDER HEAD"
    assert meta_items[0]["meta_title"] == "Yamaha BGPK Cylinder Head | India Spare"
    assert "meta_short_description" not in meta_items[0]
    assert 151 <= len(meta_items[0]["meta_description"]) <= 158
    assert 120 <= len(meta_items[0]["product_description"].split()) <= 140

    assert meta_items[1]["part_name"] == "CRANKSHAFT & PISTON"
    assert meta_items[1]["product_title"] == "YAMAHA BGPK CRANKSHAFT & PISTON"
    assert meta_items[1]["meta_title"] == "Yamaha BGPK Crankshaft & Piston | India Spare"
    assert "meta_short_description" not in meta_items[1]
    assert 151 <= len(meta_items[1]["meta_description"]) <= 158
    assert 120 <= len(meta_items[1]["product_description"].split()) <= 140


def test_export_metadata_excel_and_csv():
    figure = {"fig_no": "1", "fig_name": "CYLINDER HEAD", "first_page": 7}
    meta_item = generate_main_part_metadata(
        figure=figure,
        model_code="BGPK",
        brand="YAMAHA",
        model="",
        series="series",
    )
    meta_items = [meta_item]

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
    assert ws.cell(row=2, column=8).value == "YAMAHA BGPK CYLINDER HEAD"
    assert ws.cell(row=2, column=9).value == "Yamaha BGPK Cylinder Head | India Spare"
    assert 151 <= len(ws.cell(row=2, column=10).value) <= 158
    assert 120 <= len(ws.cell(row=2, column=12).value.split()) <= 140

    # Test CSV generation
    csv_buf = export_metadata_csv(meta_items)
    assert csv_buf.getbuffer().nbytes > 0
    csv_content = csv_buf.getvalue().decode("utf-8-sig")
    assert "Product Title (IN CAPS)" in csv_content
    assert "Meta Title" in csv_content
    assert "Meta Short Description" not in csv_content
    assert "Meta Description (151-158 Chars)" in csv_content
    assert "Product Description (120-140 Words)" in csv_content
    assert "YAMAHA BGPK CYLINDER HEAD" in csv_content
    assert "Yamaha BGPK Cylinder Head | India Spare" in csv_content
    assert "INDIA SPARE" not in csv_content
