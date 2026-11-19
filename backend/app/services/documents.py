"""Turning uploaded files (PDFs, photos) into text or model-ready images."""

import fitz
from fastapi import HTTPException, UploadFile

from ..ai import image_data_url
from ..config import settings

IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp")


class ParsedUpload:
    def __init__(self, kind: str, text: str = "", images: list[str] | None = None):
        self.kind = kind  # "pdf" | "image"
        self.text = text
        self.images = images or []


async def read_upload(file: UploadFile, max_pdf_pages_as_images: int = 3) -> ParsedUpload:
    data = await file.read()
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File is larger than {settings.max_upload_mb} MB.")
    if not data:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    name = (file.filename or "").lower()
    content_type = (file.content_type or "").lower()

    if content_type == "application/pdf" or name.endswith(".pdf"):
        return _parse_pdf(data, max_pdf_pages_as_images)

    if content_type.startswith("image/") or name.endswith(IMAGE_EXTS):
        mime = content_type if content_type.startswith("image/") else "image/png"
        return ParsedUpload("image", images=[image_data_url(data, mime)])

    raise HTTPException(status_code=400, detail="Only PDF and image files (PNG, JPG, WEBP) are supported.")


def _parse_pdf(data: bytes, max_images: int) -> ParsedUpload:
    try:
        document = fitz.open(stream=data, filetype="pdf")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not open that PDF.") from exc

    pages: list[str] = []
    images: list[str] = []
    try:
        for index in range(len(document)):
            text = document.load_page(index).get_text("text").strip()
            if text:
                pages.append(f"Page {index + 1}:\n{text}")

        # Scanned PDFs have no text layer: fall back to rendering pages for vision.
        if sum(len(p) for p in pages) < 200:
            for index in range(min(len(document), max_images)):
                pixmap = document.load_page(index).get_pixmap(matrix=fitz.Matrix(1.6, 1.6))
                images.append(image_data_url(pixmap.tobytes("png"), "image/png"))
    finally:
        document.close()

    if not pages and not images:
        raise HTTPException(status_code=400, detail="That PDF appears to be empty.")

    return ParsedUpload("pdf", text="\n\n".join(pages), images=images)
