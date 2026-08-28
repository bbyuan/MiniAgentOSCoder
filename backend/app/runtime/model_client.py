from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

from app.models.base import Serializable


@dataclass(slots=True)
class ModelMessage(Serializable):
    role: str
    content: str


@dataclass(slots=True)
class ModelRequest(Serializable):
    messages: list[ModelMessage]
    model: str = "static"
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class ModelResponse(Serializable):
    content: str
    model: str = "static"
    usage: dict[str, int] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)


class ModelClient(Protocol):
    def complete(self, request: ModelRequest) -> ModelResponse:
        """Return one model response for a runtime planning request."""


@dataclass(slots=True)
class StaticModelClient:
    response_content: str
    model: str = "static"

    def complete(self, request: ModelRequest) -> ModelResponse:
        prompt_tokens = sum(len(message.content.split()) for message in request.messages)
        completion_tokens = len(self.response_content.split())
        return ModelResponse(
            content=self.response_content,
            model=self.model,
            usage={
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens,
            },
            metadata={"request_model": request.model},
        )
