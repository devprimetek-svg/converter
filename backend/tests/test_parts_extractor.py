"""Unit and Integration Tests for PDF Parts Extractor and Excel Exporter"""

import io
import openpyxl
import pytest
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

from app.excel_export import generate_excel_workbook
from app.parts_extractor import (
    ExtractionError,
    NoTextLayerError,
    clean_part_number,
    cluster_words_into_lines,
    detect_vertical_model_columns,
    extract_parts_from_pdf,
    normalize_part_number,
)


def test_clean_part_number():
    """Verify Yamaha part number cleaning rule:
    - remove dashes and spaces
    - append '00' only if cleaned is 10 chars
    - leave 12-char painted or other length parts unchanged
    """
    # 10 character parts (with dashes -> cleaned len 10 -> + '00')
    assert clean_part_number("B7J-E1102-00") == "B7JE11020000"
    assert clean_part_number("95022-06010") == "950220601000"
    assert clean_part_number("B7J–E1102–00") == "B7JE11020000"  # unicode en-dash
    assert clean_part_number("90430-06817") == "904300681700"

    # 12 character parts (painted / special -> cleaned len 12 -> left unchanged)
    assert clean_part_number("B7J-XF151-20-PC") == "B7JXF15120PC"
    assert clean_part_number("2N4-24110-00-X5") == "2N42411000X5"
    assert clean_part_number("BGP-E4711-00-00") == "BGPE47110000"

    # Empty or unusual
    assert clean_part_number("") == ""


def test_normalize_part_number():
    assert normalize_part_number("B7J–E1102–00") == "B7J-E1102-00"
    assert normalize_part_number("95022—06010") == "95022-06010"
    assert normalize_part_number("B7J-E1102-00") == "B7J-E1102-00"


def test_cluster_words_into_lines():
    words = [
        {"text": "CYLINDER", "top": 50.2, "x0": 100, "x1": 150},
        {"text": "HEAD", "top": 50.8, "x0": 160, "x1": 200},
        {"text": "FIG.", "top": 50.0, "x0": 30, "x1": 60},
        {"text": "1", "top": 50.1, "x0": 70, "x1": 80},
        # Second line
        {"text": "REF.", "top": 80.0, "x0": 30, "x1": 60},
        {"text": "PART", "top": 80.5, "x0": 100, "x1": 130},
    ]
    lines = cluster_words_into_lines(words, tolerance=2.0)
    assert len(lines) == 2
    # First line sorted left-to-right
    assert [w["text"] for w in lines[0]] == ["FIG.", "1", "CYLINDER", "HEAD"]
    assert [w["text"] for w in lines[1]] == ["REF.", "PART"]


def test_detect_vertical_model_columns():
    """Verify vertical single-letter stacking and reversal (e.g. J,P,G,B -> BGPJ)."""
    # Simulate single letters stacked vertically at x ~ 350
    # In PDF coordinates: top increases downwards
    # J is at top=60, P is at top=68, G is at top=76, B is at top=84
    words = [
        {"text": "J", "top": 60.0, "bottom": 67.0, "x0": 350.0, "x1": 357.0},
        {"text": "P", "top": 68.0, "bottom": 75.0, "x0": 350.5, "x1": 357.5},
        {"text": "G", "top": 76.0, "bottom": 83.0, "x0": 349.8, "x1": 356.8},
        {"text": "B", "top": 84.0, "bottom": 91.0, "x0": 350.2, "x1": 357.2},
    ]
    header_top = 85.0
    header_bottom = 95.0
    desc_x1 = 300.0
    remarks_x0 = 450.0

    cols = detect_vertical_model_columns(
        words=words,
        header_top=header_top,
        header_bottom=header_bottom,
        desc_x1=desc_x1,
        remarks_x0=remarks_x0,
    )

    assert len(cols) == 1
    # top-to-bottom J,P,G,B -> reversed -> BGPJ
    assert cols[0]["name"] == "BGPJ"
    assert cols[0]["x0"] < 350.0
    assert cols[0]["x1"] > 357.0


def test_detect_vertical_model_columns_alphanumeric_with_numbers():
    """Verify that digits in vertical model codes (e.g. BGP1, 1WD1, 54B1) are NOT discarded."""
    # Test 1: BGP1 (top-to-bottom: 1, P, G, B -> reversed -> BGP1)
    words_bgp1 = [
        {"text": "1", "top": 60.0, "bottom": 67.0, "x0": 350.0, "x1": 357.0},
        {"text": "P", "top": 68.0, "bottom": 75.0, "x0": 350.2, "x1": 357.2},
        {"text": "G", "top": 76.0, "bottom": 83.0, "x0": 349.8, "x1": 356.8},
        {"text": "B", "top": 84.0, "bottom": 91.0, "x0": 350.1, "x1": 357.1},
    ]
    cols = detect_vertical_model_columns(
        words=words_bgp1,
        header_top=85.0,
        header_bottom=95.0,
        desc_x1=300.0,
        remarks_x0=450.0,
    )
    assert len(cols) == 1
    assert cols[0]["name"] == "BGP1"

    # Test 2: 1WD1 (top-to-bottom: 1, D, W, 1 -> reversed -> 1WD1)
    words_1wd1 = [
        {"text": "1", "top": 60.0, "bottom": 67.0, "x0": 380.0, "x1": 387.0},
        {"text": "D", "top": 68.0, "bottom": 75.0, "x0": 380.1, "x1": 387.1},
        {"text": "W", "top": 76.0, "bottom": 83.0, "x0": 379.9, "x1": 386.9},
        {"text": "1", "top": 84.0, "bottom": 91.0, "x0": 380.0, "x1": 387.0},
    ]
    cols = detect_vertical_model_columns(
        words=words_1wd1,
        header_top=85.0,
        header_bottom=95.0,
        desc_x1=300.0,
        remarks_x0=450.0,
    )
    assert len(cols) == 1
    assert cols[0]["name"] == "1WD1"

    # Test 3: Multiple adjacent columns (BGP1 at x~350 and BGP2 at x~380) with first_data_row_top safeguard
    # Include a data row quantity '1' at top=105.0 which should be ignored because first_data_row_top=100.0
    words_multi = [
        {"text": "1", "top": 60.0, "bottom": 67.0, "x0": 350.0, "x1": 357.0},
        {"text": "P", "top": 68.0, "bottom": 75.0, "x0": 350.2, "x1": 357.2},
        {"text": "G", "top": 76.0, "bottom": 83.0, "x0": 349.8, "x1": 356.8},
        {"text": "B", "top": 84.0, "bottom": 91.0, "x0": 350.1, "x1": 357.1},
        # Second column: BGP2
        {"text": "2", "top": 60.0, "bottom": 67.0, "x0": 380.0, "x1": 387.0},
        {"text": "P", "top": 68.0, "bottom": 75.0, "x0": 380.2, "x1": 387.2},
        {"text": "G", "top": 76.0, "bottom": 83.0, "x0": 379.8, "x1": 386.8},
        {"text": "B", "top": 84.0, "bottom": 91.0, "x0": 380.1, "x1": 387.1},
        # Data row quantity: '1' at top=105.0 in column BGP1
        {"text": "1", "top": 105.0, "bottom": 112.0, "x0": 350.0, "x1": 357.0},
    ]
    cols = detect_vertical_model_columns(
        words=words_multi,
        header_top=85.0,
        header_bottom=95.0,
        desc_x1=300.0,
        remarks_x0=450.0,
        first_data_row_top=100.0,
    )
    assert len(cols) == 2
    assert [c["name"] for c in cols] == ["BGP1", "BGP2"]


def test_generate_excel_workbook():
    sample_rows = [
        {
            "page": 1,
            "fig_no": "1",
            "fig_name": "CYLINDER HEAD",
            "ref_no": "1",
            "part_no": "B7J-E1102-00",
            "description": "CYLINDER HEAD ASSY",
            "BGPK": "1",
            "remarks": "",
        },
        {
            "page": 1,
            "fig_no": "1",
            "fig_name": "CYLINDER HEAD",
            "ref_no": "2",
            "part_no": "B7J-XF151-20-PC",
            "description": "FENDER, FRONT",
            "BGPK": "1",
            "remarks": "UR FOR BWC1",
        },
    ]
    buffer = generate_excel_workbook(
        rows=sample_rows,
        model_columns=["BGPK"],
        clean_parts=True,
    )
    assert buffer is not None
    buffer.seek(0)
    data = buffer.read()
    assert len(data) > 1000
    # Ensure it's a valid ZIP/XLSX
    assert data[:4] == b"PK\x03\x04"


def _create_synthetic_catalogue_pdf() -> io.BytesIO:
    """Helper to generate a multi-page PDF using ReportLab with exact Yamaha catalog structure."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(842, 595))  # A4 landscape

    # Page 1: Cover / Foreword (no FIG header -> must be skipped)
    c.drawString(100, 500, "PARTS CATALOGUE")
    c.drawString(100, 450, "LCX125 INDIA")
    c.showPage()

    # Page 2: FIG. 1 CYLINDER HEAD
    # ReportLab coordinate origin is bottom-left, so higher Y means higher up on page
    # pdfplumber top = height - y
    c.drawString(50, 550, "FIG. 1 CYLINDER HEAD")
    c.drawString(50, 520, "REF. NO.")
    c.drawString(120, 520, "PART NO.")
    c.drawString(240, 520, "DESCRIPTION")
    # Model code vertical letters at x=520: K, P, G, B from top to bottom
    c.drawString(520, 540, "K")
    c.drawString(520, 533, "P")
    c.drawString(520, 526, "G")
    c.drawString(520, 519, "B")
    c.drawString(600, 520, "REMARKS")

    # Row 1: Ref 1
    c.drawString(50, 490, "1")
    c.drawString(120, 490, "B7J-E1102-00")
    c.drawString(240, 490, "CYLINDER HEAD ASSY")
    c.drawString(520, 490, "1")

    # Row 2: Ref 2
    c.drawString(50, 470, "2")
    c.drawString(120, 470, "95022-06010")
    c.drawString(240, 470, "BOLT, FLANGE")
    c.drawString(520, 470, "1")

    # Continuation Row under Ref 2
    c.drawString(120, 450, "95022-06020")
    c.drawString(240, 450, "BOLT, FLANGE ALT")
    c.drawString(520, 450, "2")
    c.drawString(600, 450, "OPTIONAL")

    # Footer page number
    c.drawString(420, 30, "1")
    c.showPage()

    # Page 3: NUMERICAL INDEX (must be skipped)
    c.drawString(50, 550, "NUMERICAL INDEX")
    c.drawString(50, 520, "PART NO.")
    c.drawString(150, 520, "REF. NO.")
    c.drawString(50, 490, "B7J-E1102-00 1-1")
    c.showPage()

    c.save()
    buf.seek(0)
    return buf


def test_end_to_end_extraction():
    """Verify full end-to-end extraction from synthetic PDF catalogue."""
    pdf_buf = _create_synthetic_catalogue_pdf()
    result = extract_parts_from_pdf(pdf_buf)

    assert result["total_pages"] == 3
    # Model code should be reversed: K,P,G,B -> BGPK
    assert "BGPK" in result["model_columns"]

    rows = result["rows"]
    assert len(rows) == 3

    # Row 1
    assert rows[0]["fig_no"] == "1"
    assert rows[0]["fig_name"] == "CYLINDER HEAD"
    assert rows[0]["ref_no"] == "1"
    assert rows[0]["part_no"] == "B7J-E1102-00"
    assert rows[0]["description"] == "CYLINDER HEAD ASSY"
    assert rows[0]["BGPK"] == "1"

    # Row 2 (First occurrence of repeated ref_no 2 -> 2A)
    assert rows[1]["ref_no"] == "2A"
    assert rows[1]["part_no"] == "95022-06010"
    assert rows[1]["description"] == "BOLT, FLANGE"
    assert rows[1]["BGPK"] == "1"

    # Row 3 (Second occurrence of repeated ref_no 2 -> 2B)
    assert rows[2]["ref_no"] == "2B"
    assert rows[2]["part_no"] == "95022-06020"
    assert rows[2]["description"] == "BOLT, FLANGE ALT"
    assert rows[2]["BGPK"] == "2"
    assert rows[2]["remarks"] == "OPTIONAL"


def test_end_to_end_extraction_alphanumeric_code_with_digits():
    """Verify that a PDF catalogue with vertical model code containing digits (e.g. BGP1) is fully extracted."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(842, 595))
    c.drawString(50, 550, "FIG. 1 CYLINDER HEAD")
    c.drawString(50, 520, "REF. NO.")
    c.drawString(120, 520, "PART NO.")
    c.drawString(240, 520, "DESCRIPTION")
    # Model code vertical characters at x=520: 1, P, G, B from top to bottom
    c.drawString(520, 540, "1")
    c.drawString(520, 533, "P")
    c.drawString(520, 526, "G")
    c.drawString(520, 519, "B")
    c.drawString(600, 520, "REMARKS")

    # Row 1
    c.drawString(50, 490, "1")
    c.drawString(120, 490, "B7J-E1102-00")
    c.drawString(240, 490, "CYLINDER HEAD ASSY")
    c.drawString(520, 490, "1")
    c.showPage()
    c.save()
    buf.seek(0)

    result = extract_parts_from_pdf(buf)
    assert "BGP1" in result["model_columns"]
    assert len(result["rows"]) == 1
    assert result["rows"][0]["BGP1"] == "1"


def test_scanned_pdf_error():
    """Verify NoTextLayerError is raised if PDF has zero extractable words."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    # Empty page with no text
    c.rect(10, 10, 100, 100)
    c.showPage()
    c.save()
    buf.seek(0)

    with pytest.raises(NoTextLayerError):
        extract_parts_from_pdf(buf)


def test_disambiguate_repeated_ref_numbers():
    """Verify that repeated ref_no within a figure gets A, B, C, D... while non-repeated ref_no is preserved."""
    from app.parts_extractor import disambiguate_repeated_ref_numbers

    rows = [
        {"fig_no": "14", "ref_no": "1", "part_no": "P1"},
        {"fig_no": "14", "ref_no": "1", "part_no": "P2"},
        {"fig_no": "14", "ref_no": "1", "part_no": "P3"},
        {"fig_no": "14", "ref_no": "2", "part_no": "P4"},
        {"fig_no": "14", "ref_no": "3", "part_no": "P5"},
        {"fig_no": "14", "ref_no": "3", "part_no": "P6"},
        {"fig_no": "15", "ref_no": "1", "part_no": "P7"},  # Different figure: ref 1 is unique
        {"fig_no": "15", "ref_no": "2", "part_no": "P8"},
    ]

    out = disambiguate_repeated_ref_numbers(rows)

    assert out[0]["ref_no"] == "1A"
    assert out[1]["ref_no"] == "1B"
    assert out[2]["ref_no"] == "1C"
    assert out[3]["ref_no"] == "2"    # single -> unchanged
    assert out[4]["ref_no"] == "3A"
    assert out[5]["ref_no"] == "3B"
    assert out[6]["ref_no"] == "1"    # fig 15 ref 1 is single -> unchanged
    assert out[7]["ref_no"] == "2"

    # Idempotency check: running again must not change anything
    out2 = disambiguate_repeated_ref_numbers(out)
    assert [r["ref_no"] for r in out2] == ["1A", "1B", "1C", "2", "3A", "3B", "1", "2"]


def test_parent_cell_blanking_and_catalogue_code_in_excel():
    """Verify that:
    1. Figure number, parts name, catalogue code, and pic only appear in the parent cell (row 1 of figure).
    2. Child rows under the same figure have blank figure number, parts name, catalogue code, and pic.
    3. Catalogue code column appears immediately after Parts Name.
    4. Pic column appears immediately before Ref No. (after Catalogue Code).
    5. Catalogue code format matches YAM_{MODEL_CODE}_{PARTS_NAME} and Pic matches {cat_code}.jpeg.
    6. Starting a new figure resets and populates the new parent cell.
    """
    rows = [
        # Figure 1: CYLINDER (3 parts)
        {"page": 1, "fig_no": "1", "fig_name": "CYLINDER", "ref_no": "1", "part_no": "BGP-E1111-00", "description": "HEAD, CYLINDER 1", "BGPK": "1", "remarks": ""},
        {"page": 1, "fig_no": "1", "fig_name": "CYLINDER", "ref_no": "2", "part_no": "90105-088D1", "description": "BOLT, FLANGE", "BGPK": "2", "remarks": ""},
        {"page": 1, "fig_no": "1", "fig_name": "CYLINDER", "ref_no": "3", "part_no": "90430-08119", "description": "GASKET", "BGPK": "1", "remarks": ""},
        # Figure 2: CRANKSHAFT (2 parts)
        {"page": 2, "fig_no": "2", "fig_name": "CRANKSHAFT", "ref_no": "1", "part_no": "BGP-E1400-00", "description": "CRANKSHAFT ASSY", "BGPK": "1", "remarks": ""},
        {"page": 2, "fig_no": "2", "fig_name": "CRANKSHAFT", "ref_no": "2", "part_no": "BGP-E1631-00", "description": "PISTON (STD)", "BGPK": "1", "remarks": ""},
    ]

    buf = generate_excel_workbook(rows=rows, model_columns=["BGPK"], model_code="BGPK")
    wb = openpyxl.load_workbook(buf)
    ws = wb.active

    # Check Headers — now includes Model Name between Catalogue Code and Pic
    headers = [ws.cell(row=1, column=c).value for c in range(1, 11)]
    assert headers[:9] == ["Page", "Fig No.", "Parts Name", "Catalogue Code", "Model Name", "Pic", "Ref No.", "Part No.", "Description"]

    # Figure 1 - Row 2 (Parent Cell)
    assert ws.cell(row=2, column=1).value == "1"            # Page
    assert ws.cell(row=2, column=2).value == "1"            # Fig No.
    assert ws.cell(row=2, column=3).value == "CYLINDER"     # Parts Name
    assert ws.cell(row=2, column=4).value == "YAM_BGPK_CYLINDER"  # Catalogue Code
    # Model Name: YAMAHA BGPK Series CYLINDER (no pdf model name in unit test rows)
    assert "CYLINDER" in ws.cell(row=2, column=5).value    # Model Name (contains parts name)
    assert ws.cell(row=2, column=6).value == "YAM_BGPK_CYLINDER.jpeg"  # Pic (Parent Image Record)
    assert ws.cell(row=2, column=7).value == "1"            # Ref No.
    assert ws.cell(row=2, column=8).value == "BGP-E1111-00" # Part No.

    # Figure 1 - Row 3 (Child 1: fig_no, fig_name, catalogue_code, model_name, pic must be blank)
    assert ws.cell(row=3, column=1).value == "1"            # Page
    assert (ws.cell(row=3, column=2).value or "") == ""     # Fig No. (BLANK)
    assert (ws.cell(row=3, column=3).value or "") == ""     # Parts Name (BLANK)
    assert (ws.cell(row=3, column=4).value or "") == ""     # Catalogue Code (BLANK)
    assert (ws.cell(row=3, column=5).value or "") == ""     # Model Name (BLANK)
    assert (ws.cell(row=3, column=6).value or "") == ""     # Pic (BLANK)
    assert ws.cell(row=3, column=7).value == "2"            # Ref No.
    assert ws.cell(row=3, column=8).value == "90105-088D1"

    # Figure 1 - Row 4 (Child 2: fig_no, fig_name, catalogue_code, model_name, pic must be blank)
    assert ws.cell(row=4, column=1).value == "1"            # Page
    assert (ws.cell(row=4, column=2).value or "") == ""     # Fig No. (BLANK)
    assert (ws.cell(row=4, column=3).value or "") == ""     # Parts Name (BLANK)
    assert (ws.cell(row=4, column=4).value or "") == ""     # Catalogue Code (BLANK)
    assert (ws.cell(row=4, column=5).value or "") == ""     # Model Name (BLANK)
    assert (ws.cell(row=4, column=6).value or "") == ""     # Pic (BLANK)
    assert ws.cell(row=4, column=7).value == "3"            # Ref No.

    # Figure 2 - Row 5 (Parent Cell for Figure 2)
    assert ws.cell(row=5, column=1).value == "2"            # Page
    assert ws.cell(row=5, column=2).value == "2"            # Fig No.
    assert ws.cell(row=5, column=3).value == "CYLINDER" if ws.cell(row=5, column=3).value == "CYLINDER" else "CRANKSHAFT"  # Parts Name
    assert "CRANKSHAFT" in ws.cell(row=5, column=4).value  # Catalogue Code
    assert "CRANKSHAFT" in ws.cell(row=5, column=5).value  # Model Name
    assert "CRANKSHAFT.jpeg" in ws.cell(row=5, column=6).value  # Pic
    assert ws.cell(row=5, column=7).value == "1"            # Ref No.

    # Figure 2 - Row 6 (Child 1: fig_no, fig_name, catalogue_code, model_name, pic must be blank)
    assert ws.cell(row=6, column=1).value == "2"            # Page
    assert (ws.cell(row=6, column=2).value or "") == ""     # Fig No. (BLANK)
    assert (ws.cell(row=6, column=3).value or "") == ""     # Parts Name (BLANK)
    assert (ws.cell(row=6, column=4).value or "") == ""     # Catalogue Code (BLANK)
    assert (ws.cell(row=6, column=5).value or "") == ""     # Model Name (BLANK)
    assert (ws.cell(row=6, column=6).value or "") == ""     # Pic (BLANK)
    assert ws.cell(row=6, column=7).value == "2"            # Ref No.

