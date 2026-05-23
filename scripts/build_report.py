from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
REPORT = ROOT / "report"
OUTPUT = REPORT / "DataInsight_Report.docx"

REPO_LINK = "https://github.com/dsfga/datainsight-agent"


def style_document(doc):
    section = doc.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(1)
    section.bottom_margin = Inches(1)
    section.left_margin = Inches(1)
    section.right_margin = Inches(1)
    section.header_distance = Inches(0.492)
    section.footer_distance = Inches(0.492)

    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(10.5)
    normal.paragraph_format.space_after = Pt(5)
    normal.paragraph_format.line_spacing = 1.1


def set_table_width(table, width_dxa):
    tbl_pr = table._tbl.tblPr
    tbl_w = tbl_pr.first_child_found_in("w:tblW")
    if tbl_w is None:
        tbl_w = OxmlElement("w:tblW")
        tbl_pr.append(tbl_w)
    tbl_w.set(qn("w:type"), "dxa")
    tbl_w.set(qn("w:w"), str(width_dxa))


def set_cell_width(cell, width_dxa):
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_w = tc_pr.first_child_found_in("w:tcW")
    if tc_w is None:
        tc_w = OxmlElement("w:tcW")
        tc_pr.append(tc_w)
    tc_w.set(qn("w:w"), str(width_dxa))
    tc_w.set(qn("w:type"), "dxa")


def set_cell_margins(cell, top=80, start=120, bottom=80, end=120):
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for name, value in {"top": top, "start": start, "bottom": bottom, "end": end}.items():
        node = tc_mar.find(qn(f"w:{name}"))
        if node is None:
            node = OxmlElement(f"w:{name}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shading = OxmlElement("w:shd")
    shading.set(qn("w:fill"), fill)
    tc_pr.append(shading)


def set_table_borders(table, color="DADCE0"):
    tbl_pr = table._tbl.tblPr
    borders = tbl_pr.first_child_found_in("w:tblBorders")
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        node = borders.find(qn(f"w:{edge}"))
        if node is None:
            node = OxmlElement(f"w:{edge}")
            borders.append(node)
        node.set(qn("w:val"), "single")
        node.set(qn("w:sz"), "4")
        node.set(qn("w:space"), "0")
        node.set(qn("w:color"), color)


def add_title(doc, title, subtitle):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(2)
    run = p.add_run(title)
    run.font.name = "Calibri"
    run.font.size = Pt(22)
    run.font.bold = True
    run.font.color.rgb = RGBColor(23, 33, 43)

    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(8)
    run = p.add_run(subtitle)
    run.font.name = "Calibri"
    run.font.size = Pt(10.5)
    run.font.color.rgb = RGBColor(98, 112, 127)


def add_heading(doc, text, level=1):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8 if level == 1 else 6)
    p.paragraph_format.space_after = Pt(4)
    run = p.add_run(text)
    run.font.name = "Calibri"
    run.font.bold = True
    run.font.size = Pt(15 if level == 1 else 12)
    run.font.color.rgb = RGBColor(46, 116, 181 if level == 1 else 120)
    return p


def add_label_value(doc, label, value):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(5)
    label_run = p.add_run(f"{label}: ")
    label_run.bold = True
    value_run = p.add_run(value)
    value_run.font.color.rgb = RGBColor(52, 76, 154)


def add_bullets(doc, items):
    for item in items:
        p = doc.add_paragraph(style="List Bullet")
        p.paragraph_format.space_after = Pt(3)
        p.paragraph_format.line_spacing = 1.1
        p.add_run(item)


def add_caption(cell, text):
    p = cell.add_paragraph()
    p.paragraph_format.space_before = Pt(3)
    p.paragraph_format.space_after = Pt(0)
    run = p.add_run(text)
    run.font.size = Pt(8.5)
    run.font.color.rgb = RGBColor(82, 98, 113)


def build():
    REPORT.mkdir(parents=True, exist_ok=True)
    doc = Document()
    style_document(doc)

    add_title(doc, "DataInsight Agent", "COMPSCI 767 Assignment 2 - Intelligent CSV Cleaning and Analysis Agent")
    add_label_value(doc, "GitHub repository", REPO_LINK)
    add_heading(doc, "System Design", 1)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.add_run().add_picture(str(ASSETS / "system-design.png"), width=Inches(6.1))

    add_heading(doc, "Design Explanation", 1)
    add_bullets(
        doc,
        [
            "Perception parses CSV rows and profiles column types, missing values, duplicate rows, category variation, outliers, and possible sensitive columns.",
            "Decision logic chooses a cleaning plan from conservative, balanced, or aggressive mode and selects analysis steps from available numeric, categorical, and date fields.",
            "Action transforms the dataset, exports cleaned CSV, renders charts, summarizes findings, and records a lightweight memory checkpoint.",
            "Safety mechanisms keep processing local, flag possible sensitive columns, and raise risk when cleaning may change numeric meaning.",
        ],
    )

    doc.add_page_break()
    add_title(doc, "How the Prototype Works", "Screenshots from the running local web app")
    table = doc.add_table(rows=2, cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    set_table_width(table, 9360)
    set_table_borders(table)

    screenshots = [
        (ASSETS / "screenshot-balanced.png", "Balanced mode: the agent perceives data quality problems and chooses seven low-risk cleaning actions."),
        (ASSETS / "screenshot-analysis.png", "Results view: the agent acts by plotting charts, previewing cleaned data, and summarizing findings."),
    ]

    for col in range(2):
        set_cell_width(table.cell(0, col), 4680)
        set_cell_width(table.cell(1, col), 4680)
        set_cell_margins(table.cell(0, col))
        set_cell_margins(table.cell(1, col))
        set_cell_shading(table.cell(1, col), "F8FAFC")
        table.cell(0, col).vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        table.cell(1, col).vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP

    for col, (path, caption) in enumerate(screenshots):
        p = table.cell(0, col).paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.add_run().add_picture(str(path), width=Inches(3.05))
        add_caption(table.cell(1, col), caption)

    add_heading(doc, "Workflow Evidence", 1)
    add_bullets(
        doc,
        [
            "Run Agent produces a visible perceive-decide-act pipeline from the sample CSV.",
            "Balanced mode flags outliers for review; aggressive mode caps them and marks medium risk.",
            "The chart panel shows the agent selected analysis actions based on detected columns.",
            "The cleaned CSV export and memory log show concrete actions and stateful behavior.",
        ],
    )

    doc.save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    build()
