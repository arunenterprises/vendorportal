"""Render docs/VPS_SETUP_GUIDE.md into a readable A4 PDF (ReportLab)."""

import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

SRC = Path("/app/docs/VPS_SETUP_GUIDE.md")
OUT = Path("/app/docs/ARUN_VENDOR_PORTAL_VPS_SETUP_GUIDE.pdf")

base = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=base["Heading1"], fontSize=17, leading=21, spaceAfter=8, textColor=colors.HexColor("#0B132B"))
H2 = ParagraphStyle("H2", parent=base["Heading2"], fontSize=13, leading=17, spaceBefore=14, spaceAfter=6, textColor=colors.HexColor("#1D4ED8"))
BODY = ParagraphStyle("Body", parent=base["BodyText"], fontSize=9.5, leading=13.5, alignment=TA_LEFT, spaceAfter=4)
BULLET = ParagraphStyle("Bullet", parent=BODY, leftIndent=12, bulletIndent=3)
CODE = ParagraphStyle(
    "Code", parent=base["Code"], fontName="Courier", fontSize=8, leading=10.5,
    backColor=colors.HexColor("#F4F6FB"), borderPadding=5, textColor=colors.HexColor("#111827"), spaceAfter=6,
)


def esc(text: str) -> str:
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    return re.sub(r"`(.+?)`", r'<font face="Courier">\1</font>', text)


def build() -> None:
    lines = SRC.read_text().splitlines()
    story, code, table = [], [], []
    i = 0

    def flush_code():
        if code:
            story.append(Paragraph("<br/>".join(esc(c) or "&nbsp;" for c in code), CODE))
            code.clear()

    def flush_table():
        if table:
            rows = [[Paragraph(esc(c), BODY) for c in r] for r in table]
            t = Table(rows, colWidths=[(170 * mm) / len(table[0])] * len(table[0]))
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E8EDF9")),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#C7D0E0")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]))
            story.extend([t, Spacer(1, 6)])
            table.clear()

    in_code = False
    while i < len(lines):
        line = lines[i].rstrip()
        if line.startswith("```"):
            if in_code:
                flush_code()
            in_code = not in_code
            i += 1
            continue
        if in_code:
            code.append(line)
            i += 1
            continue
        if line.startswith("|"):
            cells = [c.strip() for c in line.strip("|").split("|")]
            if not all(set(c) <= set("-: ") for c in cells):
                table.append(cells)
            i += 1
            continue
        flush_table()
        if line.startswith("# "):
            story.extend([Paragraph(esc(line[2:]), H1), HRFlowable(width="100%", color=colors.HexColor("#1D4ED8")), Spacer(1, 6)])
        elif line.startswith("## "):
            story.append(Paragraph(esc(line[3:]), H2))
        elif line.startswith("---"):
            story.append(Spacer(1, 4))
        elif re.match(r"^\d+\. ", line):
            story.append(Paragraph(esc(line[line.index(" ") + 1:]), BULLET, bulletText="•"))
        elif line.startswith("- "):
            story.append(Paragraph(esc(line[2:]), BULLET, bulletText="•"))
        elif line:
            story.append(Paragraph(esc(line), BODY))
        i += 1
    flush_code()
    flush_table()

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(colors.HexColor("#6B7280"))
        canvas.drawString(20 * mm, 12 * mm, "ARUN ENTERPRISES VENDOR PORTAL — VPS Setup & Migration Guide")
        canvas.drawRightString(190 * mm, 12 * mm, f"Page {doc.page}")
        canvas.restoreState()

    SimpleDocTemplate(
        str(OUT), pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
        title="ARUN ENTERPRISES VENDOR PORTAL — VPS Setup Guide", author="Arun Enterprises",
    ).build(story, onFirstPage=footer, onLaterPages=footer)
    print("written:", OUT, OUT.stat().st_size, "bytes")


build()
