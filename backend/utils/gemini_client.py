import json
import os
import re
import time
from typing import Any, Dict, Optional

from backend.services.ai_provider import BaseAIProvider, AIProviderError

DEFAULT_GEMINI_MODEL = os.getenv("AI_MODEL", "gemini-4-hydrogen")
MAX_RETRIES = 3


def extract_json_payload(raw_text: str) -> Dict[str, Any]:
    if not raw_text or not raw_text.strip():
        raise AIProviderError("Empty response from Gemini model")
    text = raw_text.strip()
    m = re.search(r"```json\s*(.*?)\s*```", text, re.DOTALL | re.IGNORECASE)
    if m:
        text = m.group(1).strip()
    else:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            text = text[start : end + 1]
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise AIProviderError(f"Model returned invalid JSON: {exc}") from exc


class GeminiProvider(BaseAIProvider):
    provider_name = "gemini"

    def __init__(self, model_name: Optional[str] = None):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise AIProviderError("Missing GEMINI_API_KEY in server environment")
        try:
            from google import genai
            from google.genai import types
        except ImportError as exc:
            raise AIProviderError("google-genai package is not installed") from exc

        self._types = types
        self._client = genai.Client(api_key=api_key)
        self.model_name = model_name or DEFAULT_GEMINI_MODEL

    def generate_structured_json(
        self,
        *,
        system_instruction: str,
        user_prompt: str,
        response_schema: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        last_err: Optional[Exception] = None
        for attempt in range(MAX_RETRIES):
            try:
                config_kwargs: Dict[str, Any] = {
                    "system_instruction": system_instruction,
                    "response_mime_type": "application/json",
                }
                if response_schema:
                    config_kwargs["response_schema"] = response_schema
                response = self._client.models.generate_content(
                    model=self.model_name,
                    contents=user_prompt,
                    config=self._types.GenerateContentConfig(**config_kwargs),
                )
                return extract_json_payload(response.text or "")
            except Exception as exc:
                last_err = exc
                if attempt < MAX_RETRIES - 1:
                    time.sleep(1.2 * (attempt + 1))
        raise AIProviderError(f"Gemini generation failed after {MAX_RETRIES} attempts: {last_err}")

    def extract_text_from_media(
        self,
        *,
        file_bytes: bytes,
        mime_type: str,
        filename: str,
    ) -> Dict[str, Any]:
        prompt = (
            "Transcribe all student handwritten or printed text from this document accurately. "
            "Do not correct student mistakes or invent unreadable words. "
            "If any portion is illegible, smudged, or ambiguous, mark [ILLEGIBLE] and list it in warnings. "
            "Return valid JSON with keys: extracted_text (string), detected_student_name (string), "
            "ocr_quality_score (number 0.0 to 1.0), warnings (array of strings), page_notes (array of strings)."
        )
        part = self._types.Part.from_bytes(data=file_bytes, mime_type=mime_type)
        response = self._client.models.generate_content(
            model=self.model_name,
            contents=[part, prompt],
            config=self._types.GenerateContentConfig(response_mime_type="application/json"),
        )
        return extract_json_payload(response.text or "")
