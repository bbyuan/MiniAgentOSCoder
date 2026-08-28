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
        return _static_response(request, self.response_content, self.model)


@dataclass(slots=True)
class QueuedStaticModelClient:
    response_contents: list[str]
    model: str = "static"
    requests: list[ModelRequest] = field(default_factory=list, init=False)
    _next_response: int = field(default=0, init=False)

    def complete(self, request: ModelRequest) -> ModelResponse:
        if self._next_response >= len(self.response_contents):
            raise RuntimeError("Queued model responses exhausted")
        self.requests.append(request)
        response_content = self.response_contents[self._next_response]
        self._next_response += 1
        return _static_response(request, response_content, self.model)


def _static_response(request: ModelRequest, content: str, model: str) -> ModelResponse:
    prompt_tokens = sum(len(message.content.split()) for message in request.messages)
    completion_tokens = len(content.split())
    return ModelResponse(
        content=content,
        model=model,
        usage={
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
        },
        metadata={"request_model": request.model},
    )
