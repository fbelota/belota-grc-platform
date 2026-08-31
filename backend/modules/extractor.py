"""Extracao de texto com fallback OCR (PDFs escaneados)"""
import io
from fastapi import HTTPException

def extract_text(data: bytes, filename: str, ocr_pages: int = 10):
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(data))
        text = "\n".join((p.extract_text() or "") for p in reader.pages)
        if text.strip():
            return text, "pdf_text"
        try:
            from pdf2image import convert_from_bytes
            import pytesseract
            last = min(ocr_pages, len(reader.pages))
            images = convert_from_bytes(data, first_page=1, last_page=last, dpi=200)
            ocr = "\n".join(pytesseract.image_to_string(img, lang="por+eng") for img in images)
            if ocr.strip():
                return ocr, "ocr"
            raise HTTPException(400, "OCR nao reconheceu texto nas primeiras paginas.")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(400, f"PDF sem texto e OCR falhou: {str(e)[:200]}")
    if name.endswith(".docx"):
        import docx
        d = docx.Document(io.BytesIO(data))
        return "\n".join(p.text for p in d.paragraphs), "docx"
    if name.endswith((".txt", ".md")):
        return data.decode("utf-8", errors="replace"), "txt"
    raise HTTPException(400, "Formato nao suportado. Envie PDF, DOCX ou TXT.")