import base64
import os
import time
from typing import Any, Dict, Optional

from backend.services.ai_provider import BaseAIProvider, AIProviderError
from backend.utils.gemini_client import extract_json_payload


class OpenRouterProvider(BaseAIProvider):
    provider_name = "openrouter"

    def __init__(self, model_name: Optional[str] = None):
        api_key = os.getenv("OPENROUTER_API_KEY")
        if not api_key:
            raise AIProviderError("Missing OPENROUTER_API_KEY in server environment")
        try:
            from openai import OpenAI
        except ImportError as exc:
            raise AIProviderError("openai package is not installed") from exc
        self._client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key)
        self.model_name = model_name or os.getenv("OPENROUTER_MODEL", "google/gemini-2.5-flash")

    def generate_structured_json(
        self,
        *,
        system_instruction: str,
        user_prompt: str,
        response_schema: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        last_err: Optional[Exception] = None
        for attempt in range(3):
            try:
                resp = self._client.chat.completions.create(
                    model=self.model_name,
                    messages=[
                        {"role": "system", "content": system_instruction},
                        {"role": "user", "content": user_prompt},
                    ],
                )
                return extract_json_payload(resp.choices[0].message.content or "")
            except Exception as exc:
                last_err = exc
                if attempt < 2:
                    time.sleep(1.2 * (attempt + 1))
        raise AIProviderError(f"OpenRouter generation failed: {last_err}")

    def extract_text_from_media(
        self,
        *,
        file_bytes: bytes,
        mime_type: str,
        filename: str,
    ) -> Dict[str, Any]:
        if mime_type == "application/pdf":
            raise AIProviderError("Direct PDF OCR requires GeminiProvider or image upload.")
        b64 = base64.b64encode(file_bytes).decode("ascii")
        resp = self._client.chat.completions.create(
            model=self.model_name,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "Transcribe the student answer verbatim. Return valid JSON with "
                                "extracted_text, detected_student_name, ocr_quality_score, warnings, page_notes."
                            ),
                        },
                        {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{b64}"}},
                    ],
                }
            ],
        )
        return extract_json_payload(resp.choices[0].message.content or "")
