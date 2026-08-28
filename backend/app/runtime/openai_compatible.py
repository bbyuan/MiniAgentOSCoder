from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Protocol
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.runtime.model_client import ModelRequest, ModelResponse


class ModelProviderError(RuntimeError):
    pass


class JsonTransport(Protocol):
    def post_json(
        self,
        *,
        url: str,
        headers: dict[str, str],
        payload: dict[str, Any],
        timeout_seconds: int,
    ) -> dict[str, Any]:
        """POST JSON and return a decoded JSON object."""


@dataclass(slots=True)
class UrllibJsonTransport:
    def post_json(
        self,
        *,
        url: str,
        headers: dict[str, str],
        payload: dict[str, Any],
        timeout_seconds: int,
    ) -> dict[str, Any]:
        request = Request(
            url=url,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with urlopen(request, timeout=timeout_seconds) as response:  # noqa: S310
                body = response.read().decode("utf-8")
        except HTTPError as exc:
            raise ModelProviderError(f"Model provider returned HTTP {exc.code}") from exc
        except URLError as exc:
            raise ModelProviderError("Model provider network request failed") from exc
        except TimeoutError as exc:
            raise ModelProviderError("Model provider request timed out") from exc

        try:
            decoded = json.loads(body)
        except json.JSONDecodeError as exc:
            raise ModelProviderError("Model provider returned invalid JSON") from exc
        if not isinstance(decoded, dict):
            raise ModelProviderError("Model provider response must be a JSON object")
        return decoded


@dataclass(slots=True)
class OpenAICompatibleModelClient:
    api_key: str = field(repr=False)
    base_url: str
    default_model: str
    timeout_seconds: int = 60
    json_mode: bool = True
    max_tokens_field: str = "max_tokens"
    transport: JsonTransport = field(default_factory=UrllibJsonTransport, repr=False)

    def complete(self, request: ModelRequest) -> ModelResponse:
        model = request.model
        if not model or model in {"static", "unset"}:
            model = self.default_model

        payload: dict[str, Any] = {
            "model": model,
            "messages": [message.to_dict() for message in request.messages],
        }
        if self.json_mode:
            payload["response_format"] = {"type": "json_object"}
        max_output_tokens = request.metadata.get("max_output_tokens")
        if self.max_tokens_field and isinstance(max_output_tokens, int) and max_output_tokens > 0:
            payload[self.max_tokens_field] = max_output_tokens

        response = self.transport.post_json(
            url=f"{self.base_url.rstrip('/')}/chat/completions",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "User-Agent": "MiniAgentOS-Coder/0.1",
            },
            payload=payload,
            timeout_seconds=self.timeout_seconds,
        )
        return _parse_chat_completion(response, fallback_model=model)


def _parse_chat_completion(response: dict[str, Any], *, fallback_model: str) -> ModelResponse:
    choices = response.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        raise ModelProviderError("Model provider response is missing choices")

    first_choice = choices[0]
    message = first_choice.get("message")
    if not isinstance(message, dict) or not isinstance(message.get("content"), str):
        raise ModelProviderError("Model provider response is missing message content")

    usage_payload = response.get("usage", {})
    usage: dict[str, int] = {}
    if isinstance(usage_payload, dict):
        usage = {
            str(key): value
            for key, value in usage_payload.items()
            if isinstance(value, int) and not isinstance(value, bool)
        }

    model = response.get("model")
    if not isinstance(model, str) or not model:
        model = fallback_model

    metadata: dict[str, Any] = {"provider": "openai-compatible"}
    response_id = response.get("id")
    finish_reason = first_choice.get("finish_reason")
    if isinstance(response_id, str):
        metadata["response_id"] = response_id
    if isinstance(finish_reason, str):
        metadata["finish_reason"] = finish_reason

    return ModelResponse(
        content=message["content"],
        model=model,
        usage=usage,
        metadata=metadata,
    )
