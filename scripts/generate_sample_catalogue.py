"""Generate a sample Yamaha-style PDF parts catalogue for testing and demonstration.
Includes multiple model codes (BGPJ, BGPL) to test multi-model extraction and exports.
"""

import os
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas


def generate_sample_pdf(output_path: str = "sample_yamaha_catalogue.pdf"):
    c = canvas.Canvas(output_path, pagesize=(842, 595))  # A4 landscape

    # -------------------------------------------------------------
    # Page 1: Title Page (No FIG heading -> should be skipped)
    # -------------------------------------------------------------
    c.setFont("Helvetica-Bold", 24)
    c.drawString(100, 450, "PARTS CATALOGUE")
    c.setFont("Helvetica", 14)
    c.drawString(100, 410, "LCX125 (BGPJ / BGPL) INDIA")
    c.drawString(100, 380, "YAMAHA GENUINE PARTS & ACCESSORIES")
    c.showPage()

    # -------------------------------------------------------------
    # Page 2: Foreword (No FIG heading -> should be skipped)
    # -------------------------------------------------------------
    c.setFont("Helvetica-Bold", 16)
    c.drawString(100, 520, "FOREWORD")
    c.setFont("Helvetica", 10)
    c.drawString(100, 480, "This Parts Catalogue is related to the parts for the model(s) on the cover page.")
    c.drawString(100, 460, "When ordering replacement parts, please quote both part numbers and names.")
    c.showPage()

    # -------------------------------------------------------------
    # Page 3: FIG. 1 CYLINDER HEAD (Two Model Codes: BGPJ & BGPL)
    # -------------------------------------------------------------
    c.setFont("Helvetica-Bold", 12)
    c.drawString(400, 560, "FIG. 1 CYLINDER HEAD")

    c.setFont("Helvetica-Bold", 8)
    c.drawString(400, 540, "REF.")
    c.drawString(400, 530, "NO.")
    c.drawString(440, 530, "PART NO.")
    c.drawString(550, 530, "DESCRIPTION")

    # Vertical Model Code 1: BGPJ (top-to-bottom: J, P, G, B so reversed = BGPJ) at x=675
    c.setFont("Helvetica-Bold", 7)
    c.drawString(675, 554, "J")
    c.drawString(675, 546, "P")
    c.drawString(675, 538, "G")
    c.drawString(675, 530, "B")

    # Vertical Model Code 2: BGPL (top-to-bottom: L, P, G, B so reversed = BGPL) at x=705
    c.drawString(705, 554, "L")
    c.drawString(705, 546, "P")
    c.drawString(705, 538, "G")
    c.drawString(705, 530, "B")

    c.setFont("Helvetica-Bold", 8)
    c.drawString(740, 530, "REMARKS")

    # Parts rows: (ref, part, desc, qty_bgpj, qty_bgpl, remarks)
    items_fig1 = [
        ("1", "B7J-E1102-00", "CYLINDER HEAD ASSY", "1", "1", ""),
        ("2", "95022-06010", "BOLT, FLANGE", "1", "1", ""),
        ("3", "90430-06817", "GASKET", "1", "", "UR FOR BGPJ"),
        ("4", "95612-08618", "BOLT, STUD", "", "2", "UR FOR BGPL"),
        ("5", "B7J-E1191-00", "COVER, CYLINDER HEAD 1", "1", "1", ""),
        ("6", "95812-06030", "BOLT, FLANGE", "4", "4", ""),
        ("7", "B7J-E1193-00", "GASKET, HEAD COVER 1", "1", "1", ""),
        ("8", "90170-08808", "NUT", "4", "4", ""),
        ("9", "94703-00894", "PLUG, SPARK (NGK CR6HSA)", "1", "1", ""),
        ("10", "B7J-E1181-00", "GASKET, CYLINDER HEAD 1", "1", "1", ""),
    ]

    y = 510
    for ref, part, desc, q_j, q_l, rem in items_fig1:
        c.setFont("Helvetica", 8)
        c.drawString(405, y, ref)
        c.drawString(440, y, part)
        c.drawString(550, y, desc)
        if q_j:
            c.drawString(677, y, q_j)
        if q_l:
            c.drawString(707, y, q_l)
        if rem:
            c.drawString(740, y, rem)
        y -= 16

    # Bottom page number
    c.setFont("Helvetica", 9)
    c.drawString(420, 30, "1")
    c.showPage()

    # -------------------------------------------------------------
    # Page 4: FIG. 14 FENDER (With continuation rows, BGPJ & BGPL)
    # -------------------------------------------------------------
    c.setFont("Helvetica-Bold", 12)
    c.drawString(400, 560, "FIG. 14 FENDER")

    c.setFont("Helvetica-Bold", 8)
    c.drawString(400, 540, "REF.")
    c.drawString(400, 530, "NO.")
    c.drawString(440, 530, "PART NO.")
    c.drawString(550, 530, "DESCRIPTION")

    # Vertical Model Code 1: BGPJ at x=675
    c.setFont("Helvetica-Bold", 7)
    c.drawString(675, 554, "J")
    c.drawString(675, 546, "P")
    c.drawString(675, 538, "G")
    c.drawString(675, 530, "B")

    # Vertical Model Code 2: BGPL at x=705
    c.drawString(705, 554, "L")
    c.drawString(705, 546, "P")
    c.drawString(705, 538, "G")
    c.drawString(705, 530, "B")

    c.setFont("Helvetica-Bold", 8)
    c.drawString(740, 530, "REMARKS")

    items_fig14 = [
        # Ref 1 with color variants (continuation rows)
        ("1", "B7J-XF151-20-PC", "FENDER, FRONT", "1", "1", "UR FOR BWC1"),
        ("", "B7J-XF151-50-P0", "FENDER, FRONT", "1", "", "UR FOR SMX (BGPJ)"),
        ("", "B7J-XF151-70-P5", "FENDER, FRONT", "", "1", "UR FOR VRC1 (BGPL)"),
        # Ref 2
        ("2", "B7J-F1541-00", ".DAMPER 1", "1", "1", ""),
        # Ref 3 with variants
        ("3", "5TS-F477X-00", ".GRAPHIC 3", "1", "", "UR FOR BWC1"),
        ("", "B2U-F8315-00", ".EMBLEM", "", "1", "UR FOR SMX,VRC1"),
        # Ref 4
        ("4", "90387-068U0", "COLLAR", "3", "3", ""),
        # Ref 5
        ("5", "95812-06020", "BOLT, FLANGE", "3", "3", ""),
    ]

    y = 510
    for ref, part, desc, q_j, q_l, rem in items_fig14:
        c.setFont("Helvetica", 8)
        if ref:
            c.drawString(405, y, ref)
        c.drawString(440, y, part)
        c.drawString(550, y, desc)
        if q_j:
            c.drawString(677, y, q_j)
        if q_l:
            c.drawString(707, y, q_l)
        if rem:
            c.drawString(740, y, rem)
        y -= 16

    c.setFont("Helvetica", 9)
    c.drawString(420, 30, "17")
    c.showPage()

    # -------------------------------------------------------------
    # Page 5: NUMERICAL INDEX (Must be skipped)
    # -------------------------------------------------------------
    c.setFont("Helvetica-Bold", 12)
    c.drawString(400, 560, "NUMERICAL INDEX")
    c.setFont("Helvetica", 8)
    c.drawString(100, 530, "PART NO.       REF. NO.")
    c.drawString(100, 510, "B7J-E1102-00   1 - 1")
    c.drawString(100, 495, "95022-06010    1 - 2")
    c.showPage()

    c.save()
    print(f"Generated multi-model sample catalogue at: {output_path}")


if __name__ == "__main__":
    generate_sample_pdf()
