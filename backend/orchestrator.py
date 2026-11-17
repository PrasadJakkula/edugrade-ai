import io
import os
from fpdf import FPDF
from PyPDF2 import PdfReader, PdfWriter

from backend.services.ai_provider import get_ai_provider


def process_full_pdf(pdf_path: str, prompt: str) -> dict:
    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()
    provider = get_ai_provider("gemini")
    ocr_result = provider.extract_text_from_media(
        file_bytes=pdf_bytes,
        mime_type="application/pdf",
        filename=os.path.basename(pdf_path),
    )
    extracted = ocr_result.get("extracted_text", "")
    result = provider.generate_structured_json(
        system_instruction="You are an academic exam grading assistant. Return strict JSON.",
        user_prompt=f"{prompt}\n\nExtracted Document Text:\n{extracted}",
    )
    return result


def split_pdf_into_exams(pdf_bytes: bytes, pages_per_exam: int = 1) -> list[bytes]:
    if not pages_per_exam or pages_per_exam < 1:
        pages_per_exam = 1
    reader = PdfReader(io.BytesIO(pdf_bytes))
    chunks: list[bytes] = []
    for start in range(0, len(reader.pages), pages_per_exam):
        writer = PdfWriter()
        for page_idx in range(start, min(start + pages_per_exam, len(reader.pages))):
            writer.add_page(reader.pages[page_idx])
        buf = io.BytesIO()
        writer.write(buf)
        chunks.append(buf.getvalue())
    return chunks


def sanitize_text(value) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        value = str(value)
    replacements = {
        "\u2019": "'",
        "\u2018": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2013": "-",
        "\u2014": "-",
        "\u00a0": " ",
    }
    for old, new in replacements.items():
        value = value.replace(old, new)
    return value.encode("latin-1", "replace").decode("latin-1")


def generate_pdf_report(exam: dict) -> bytes:
    pdf = FPDF()
    pdf.add_page()
    pdf.set_left_margin(12)
    pdf.set_right_margin(12)

    correction_block = exam.get("correction", {})
    if not isinstance(correction_block, dict):
        correction_block = {}

    student_name = correction_block.get("student_name") or exam.get("student_name", "Unknown")
    general_comment = (
        correction_block.get("general_comment")
        or correction_block.get("general_feedback")
        or exam.get("general_comment", "")
    )
    assigned_grade = correction_block.get("assigned_grade", correction_block.get("final_marks", exam.get("assigned_grade", "N/A")))
    max_grade = correction_block.get("max_grade", correction_block.get("max_marks", exam.get("max_grade", "N/A")))
    questions = correction_block.get("correction", []) or correction_block.get("criterion_evaluations", [])

    pdf.set_font("Helvetica", "B", 15)
    pdf.cell(0, 10, txt=sanitize_text(f"Evalora Assessment Report - {student_name}"), ln=True, align="C")
    pdf.set_font("Helvetica", "I", 9)
    pdf.cell(0, 5, txt="Evalora - Smarter Grading. Fairer Evaluation.", ln=True, align="C")
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, txt=sanitize_text(f"Final Score: {assigned_grade} / {max_grade}"), ln=True)
    if exam.get("reliability"):
        pdf.set_font("Helvetica", "", 10)
        pdf.cell(0, 6, txt=sanitize_text(f"Reliability Status: {exam['reliability'].get('status', 'N/A')}"), ln=True)
    pdf.ln(4)

    for idx, item in enumerate(questions, start=1):
        title = item.get("criterion_title") or item.get("question") or f"Item {idx}"
        score = item.get("awarded_marks", item.get("assigned_score", 0))
        m_score = item.get("max_marks", item.get("max_score", 0))
        expl = item.get("explanation") or item.get("comments", "")
        pdf.set_font("Helvetica", "B", 11)
        pdf.multi_cell(0, 6, txt=sanitize_text(f"{idx}. {title}: {score} / {m_score}"))
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(0, 5, txt=sanitize_text(f"   Rationale: {expl}"))
        for ev in item.get("evidence_quotes", []):
            pdf.multi_cell(0, 5, txt=sanitize_text(f'   Evidence: "{ev}"'))
        pdf.ln(2)

    if general_comment:
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 8, txt="General Feedback:", ln=True)
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(0, 5, txt=sanitize_text(general_comment))

    raw_out = pdf.output(dest="S")
    return raw_out.encode("latin-1") if isinstance(raw_out, str) else bytes(raw_out)
