import os
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional


class AIProviderError(RuntimeError):
    pass


class BaseAIProvider(ABC):
    provider_name: str = "base"

    @abstractmethod
    def generate_structured_json(
        self,
        *,
        system_instruction: str,
        user_prompt: str,
        response_schema: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def extract_text_from_media(
        self,
        *,
        file_bytes: bytes,
        mime_type: str,
        filename: str,
    ) -> Dict[str, Any]:
        raise NotImplementedError


def get_ai_provider(provider_name: Optional[str] = None) -> BaseAIProvider:
    chosen = (provider_name or os.getenv("AI_PROVIDER", "gemini")).strip().lower()
    if chosen == "gemini":
        from backend.utils.gemini_client import GeminiProvider
        return GeminiProvider()
    if chosen == "openai":
        from backend.utils.openai_client import OpenAIProvider
        return OpenAIProvider()
    if chosen == "openrouter":
        from backend.utils.openrouter_client import OpenRouterProvider
        return OpenRouterProvider()
    raise AIProviderError(f"Unsupported AI provider: {chosen}")
