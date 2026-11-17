import io
from typing import Dict, Any, List
from backend.services.ai_provider import get_ai_provider


def inspect_image_quality(image_bytes: bytes) -> Dict[str, Any]:
    """
    Checks basic resolution, aspect ratio, and tonal contrast using Pillow when installed.
    Returns quality score in [0, 1] and specific warnings.
    """
    warnings: List[str] = []
    score = 0.90
    metadata: Dict[str, Any] = {"size_bytes": len(image_bytes)}
    try:
        from PIL import Image, ImageStat

        img = Image.open(io.BytesIO(image_bytes)).convert("L")
        width, height = img.size
        metadata["width"] = width
        metadata["height"] = height

        if width < 400 or height < 300:
            score -= 0.35
            warnings.append(f"Low image resolution ({width}x{height}); handwriting may be difficult to read.")
        elif width < 700 or height < 500:
            score -= 0.12
            warnings.append(f"Moderate image resolution ({width}x{height}).")

        stat = ImageStat.Stat(img)
        stddev = stat.stddev[0] if stat.stddev else 0.0
        mean_luma = stat.mean[0] if stat.mean else 128.0
        metadata["contrast_stddev"] = round(stddev, 2)
        metadata["mean_luma"] = round(mean_luma, 2)

        if stddev < 18.0:
            score -= 0.30
            warnings.append("Very low contrast detected (faded ink, glare, or blank page).")
        if mean_luma < 45.0:
            score -= 0.20
            warnings.append("Image is severely underexposed / dark.")
        elif mean_luma > 245.0:
            score -= 0.20
            warnings.append("Image is severely overexposed / washed out.")
    except ImportError:
        warnings.append("Pillow image quality analyzer unavailable; relying on AI OCR quality estimate.")
    except Exception as exc:
        score = 0.40
        warnings.append(f"Could not decode image cleanly: {exc}")

    return {
        "quality_score": round(max(0.0, min(1.0, score)), 3),
        "warnings": warnings,
        "metadata": metadata,
    }


def extract_document(
    *,
    file_bytes: bytes,
    filename: str,
    mime_type: str,
    provider_name: str | None = None,
) -> Dict[str, Any]:
    warnings: List[str] = []
    pages: List[Dict[str, Any]] = []
    quality_score = 0.92
    detected_student_name = ""

    if mime_type == "text/plain" or filename.lower().endswith(".txt"):
        text = file_bytes.decode("utf-8", errors="replace").strip()
        if not text:
            warnings.append("Uploaded text file is empty.")
            quality_score = 0.0
        return {
            "filename": filename,
            "extracted_text": text,
            "detected_student_name": "",
            "ocr_quality_score": quality_score,
            "warnings": warnings,
            "pages": [{"page": 1, "text": text}],
            "requires_manual_verification": len(warnings) > 0,
        }

    if mime_type == "application/pdf" or filename.lower().endswith(".pdf"):
        try:
            from PyPDF2 import PdfReader

            reader = PdfReader(io.BytesIO(file_bytes))
            for idx, page in enumerate(reader.pages, start=1):
                txt = (page.extract_text() or "").strip()
                pages.append({"page": idx, "text": txt})
            combined = "\n\n".join(p["text"] for p in pages if p["text"]).strip()
            if len(combined) >= 20:
                return {
                    "filename": filename,
                    "extracted_text": combined,
                    "detected_student_name": "",
                    "ocr_quality_score": 0.95,
                    "warnings": [],
                    "pages": pages,
                    "requires_manual_verification": False,
                }
            warnings.append("PDF contains little or no selectable text (likely scanned handwriting); running multimodal OCR.")
        except Exception as exc:
            warnings.append(f"Local PDF text extraction failed ({exc}); running multimodal OCR.")

    if mime_type.startswith("image/"):
        img_check = inspect_image_quality(file_bytes)
        quality_score = img_check["quality_score"]
        warnings.extend(img_check["warnings"])

    provider = get_ai_provider(provider_name)
    ocr_data = provider.extract_text_from_media(
        file_bytes=file_bytes,
        mime_type=mime_type,
        filename=filename,
    )
    extracted_text = (ocr_data.get("extracted_text") or "").strip()
    detected_student_name = (ocr_data.get("detected_student_name") or "").strip()
    ai_quality = float(ocr_data.get("ocr_quality_score") or quality_score)
    combined_quality = round(min(quality_score, max(0.0, min(1.0, ai_quality))), 3)

    for w in ocr_data.get("warnings") or []:
        if w and w not in warnings:
            warnings.append(str(w))

    if "[ILLEGIBLE]" in extracted_text:
        warnings.append("OCR flagged one or more illegible handwriting segments ([ILLEGIBLE]).")
        combined_quality = min(combined_quality, 0.65)

    if not extracted_text:
        warnings.append("No text could be extracted from the uploaded file.")
        combined_quality = 0.0

    if not pages:
        pages = [{"page": 1, "text": extracted_text}]

    return {
        "filename": filename,
        "extracted_text": extracted_text,
        "detected_student_name": detected_student_name,
        "ocr_quality_score": combined_quality,
        "warnings": warnings,
        "pages": pages,
        "requires_manual_verification": combined_quality < 0.78 or len(warnings) > 0,
    }
