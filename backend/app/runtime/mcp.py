from __future__ import annotations

from collections.abc import Callable
import json
import os
from pathlib import Path
import re
import select
import signal
import subprocess
from time import perf_counter
from typing import Any

from app.guards import redact_secrets
from app.models import ApprovalPolicy, MCPServerManifest, RiskLevel, ToolDescriptor, ToolResult
from app.runtime.sandbox import SandboxExecutor, SandboxViolation


MCPEventHandler = Callable[[str, dict[str, object]], None]


class MCPError(RuntimeError):
    pass


class MCPStdioSession:
    def __init__(
        self,
        manifest: MCPServerManifest,
        workspace: str | Path,
        run_id: str,
        sandbox: SandboxExecutor,
        event_handler: MCPEventHandler,
    ) -> None:
        self.manifest = manifest
        self.workspace = Path(workspace).resolve()
        self.run_id = run_id
        self.sandbox = sandbox
        self.event_handler = event_handler
        self.process: subprocess.Popen[str] | None = None
        self._request_id = 0

    def start(self) -> list[dict[str, Any]]:
        self.sandbox.validate_argv(self.manifest.command)
        environment = self.sandbox.process_environment(
            f"mcp-{self.manifest.id}",
            extra_env={
                "MINIAGENTOS_RUN_ID": self.run_id,
                "MINIAGENTOS_MCP_SERVER": self.manifest.id,
            },
            host_env_allow=self.manifest.env_allow,
        )
        started = perf_counter()
        try:
            self.process = subprocess.Popen(
                self.manifest.command,
                cwd=self.workspace,
                env=environment,
                text=True,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                bufsize=1,
                start_new_session=True,
            )
            self.event_handler(
                "mcp.server.started",
                {
                    "server_id": self.manifest.id,
                    "transport": "stdio",
                    "executable": Path(self.manifest.command[0]).name,
                },
            )
            self.request(
                "initialize",
                {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "MiniAgentOS Coder", "version": "0.1.0"},
                },
            )
            self.notify("notifications/initialized", {})
            result = self.request("tools/list", {})
            tools = result.get("tools", []) if isinstance(result, dict) else []
            if not isinstance(tools, list):
                raise MCPError("MCP tools/list returned an invalid tools field")
            self.event_handler(
                "mcp.tools.discovered",
                {
                    "server_id": self.manifest.id,
                    "tool_count": len(tools),
                    "tools": [str(item.get("name", "")) for item in tools if isinstance(item, dict)],
                    "duration_ms": round((perf_counter() - started) * 1000, 3),
                },
            )
            return [item for item in tools if isinstance(item, dict)]
        except Exception as exc:
            self.event_handler(
                "mcp.server.failed",
                {"server_id": self.manifest.id, "error": redact_secrets(str(exc))},
            )
            self.close()
            if isinstance(exc, (MCPError, SandboxViolation)):
                raise
            raise MCPError(f"MCP server failed to start: {self.manifest.id}") from exc

    def call_tool(self, name: str, arguments: dict[str, Any]) -> ToolResult:
        started = perf_counter()
        try:
            result = self.request("tools/call", {"name": name, "arguments": arguments})
            output = _render_mcp_content(result.get("content", []) if isinstance(result, dict) else [])
            is_error = bool(result.get("isError", False)) if isinstance(result, dict) else False
            self.event_handler(
                "mcp.tool.called",
                {
                    "server_id": self.manifest.id,
                    "tool": name,
                    "ok": not is_error,
                    "duration_ms": round((perf_counter() - started) * 1000, 3),
                },
            )
            return ToolResult(
                ok=not is_error,
                tool=f"mcp__{self.manifest.id}__{name}",
                output=output,
                error=output if is_error else None,
                metadata={"mcp_server": self.manifest.id, "mcp_tool": name},
            )
        except Exception as exc:
            error = redact_secrets(str(exc))
            self.event_handler(
                "mcp.tool.called",
                {
                    "server_id": self.manifest.id,
                    "tool": name,
                    "ok": False,
                    "error": error,
                    "duration_ms": round((perf_counter() - started) * 1000, 3),
                },
            )
            return ToolResult(ok=False, tool=f"mcp__{self.manifest.id}__{name}", error=error)

    def request(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        self._request_id += 1
        request_id = self._request_id
        self._write({"jsonrpc": "2.0", "id": request_id, "method": method, "params": params})
        deadline = perf_counter() + self.manifest.timeout_seconds
        while True:
            remaining = deadline - perf_counter()
            if remaining <= 0:
                raise MCPError(f"MCP request timed out: {method}")
            message = self._read(remaining)
            if message.get("id") != request_id:
                continue
            if "error" in message:
                raise MCPError(f"MCP request failed: {method}: {message['error']}")
            result = message.get("result", {})
            if not isinstance(result, dict):
                raise MCPError(f"MCP response result is invalid: {method}")
            return result

    def notify(self, method: str, params: dict[str, Any]) -> None:
        self._write({"jsonrpc": "2.0", "method": method, "params": params})

    def close(self) -> None:
        process = self.process
        self.process = None
        if process is None:
            return
        if process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=1)
            except (ProcessLookupError, subprocess.TimeoutExpired):
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
        self.event_handler(
            "mcp.server.stopped",
            {"server_id": self.manifest.id, "returncode": process.poll()},
        )

    def _write(self, message: dict[str, Any]) -> None:
        if self.process is None or self.process.stdin is None or self.process.poll() is not None:
            raise MCPError(f"MCP server is not running: {self.manifest.id}")
        try:
            self.process.stdin.write(json.dumps(message, separators=(",", ":")) + "\n")
            self.process.stdin.flush()
        except (BrokenPipeError, OSError) as exc:
            raise MCPError(f"MCP server closed stdin: {self.manifest.id}") from exc

    def _read(self, timeout: float) -> dict[str, Any]:
        if self.process is None or self.process.stdout is None:
            raise MCPError(f"MCP server is not running: {self.manifest.id}")
        ready, _, _ = select.select([self.process.stdout], [], [], timeout)
        if not ready:
            raise MCPError(f"MCP response timed out: {self.manifest.id}")
        line = self.process.stdout.readline(1_000_001)
        if not line:
            raise MCPError(f"MCP server exited: {self.manifest.id}")
        if len(line) > 1_000_000:
            raise MCPError(f"MCP response exceeded the protocol limit: {self.manifest.id}")
        try:
            message = json.loads(line)
        except json.JSONDecodeError as exc:
            raise MCPError(f"MCP server returned invalid JSON: {self.manifest.id}") from exc
        if not isinstance(message, dict):
            raise MCPError("MCP message must be a JSON object")
        return message


class MCPRuntime:
    def __init__(
        self,
        manifests: list[MCPServerManifest],
        workspace: str | Path,
        run_id: str,
        sandbox: SandboxExecutor,
        event_handler: MCPEventHandler,
    ) -> None:
        self.manifests = manifests
        self.workspace = Path(workspace)
        self.run_id = run_id
        self.sandbox = sandbox
        self.event_handler = event_handler
        self.sessions: list[MCPStdioSession] = []

    def registrations(self) -> list[tuple[ToolDescriptor, Callable[[dict[str, Any]], ToolResult]]]:
        registrations: list[tuple[ToolDescriptor, Callable[[dict[str, Any]], ToolResult]]] = []
        names: set[str] = set()
        try:
            for manifest in self.manifests:
                session = MCPStdioSession(
                    manifest,
                    self.workspace,
                    self.run_id,
                    self.sandbox,
                    self.event_handler,
                )
                tools = session.start()
                self.sessions.append(session)
                for tool in tools:
                    original_name = str(tool.get("name", "")).strip()
                    if not original_name:
                        continue
                    descriptor_name = f"mcp__{_identifier(manifest.id)}__{_identifier(original_name)}"
                    if descriptor_name in names:
                        raise MCPError(f"Duplicate MCP tool descriptor: {descriptor_name}")
                    names.add(descriptor_name)
                    descriptor = ToolDescriptor(
                        name=descriptor_name,
                        description=str(tool.get("description", f"MCP tool {original_name}")),
                        effect=manifest.effect,
                        risk=_risk(manifest.risk),
                        approval_policy=ApprovalPolicy.APPROVAL_REQUIRED,
                        input_schema=_required_schema(tool.get("inputSchema", {})),
                        timeout_seconds=manifest.timeout_seconds,
                        metadata={
                            "sandbox": "mcp_stdio",
                            "mcp_server": manifest.id,
                            "mcp_tool": original_name,
                        },
                    )
                    registrations.append(
                        (descriptor, lambda params, current=session, name=original_name: current.call_tool(name, params))
                    )
            return registrations
        except Exception:
            self.close()
            raise

    def close(self) -> None:
        for session in reversed(self.sessions):
            session.close()
        self.sessions.clear()


def _required_schema(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}
    properties = value.get("properties", {})
    required = value.get("required", [])
    if not isinstance(properties, dict) or not isinstance(required, list):
        return {}
    result: dict[str, str] = {}
    for name in required:
        definition = properties.get(name, {})
        kind = definition.get("type", "object") if isinstance(definition, dict) else "object"
        result[str(name)] = str(kind) if kind in {"string", "object"} else "object"
    return result


def _render_mcp_content(value: Any, limit: int = 24000) -> str:
    parts: list[str] = []
    if isinstance(value, list):
        for item in value:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(str(item.get("text", "")))
            else:
                parts.append(json.dumps(item, ensure_ascii=False, sort_keys=True))
    else:
        parts.append(json.dumps(value, ensure_ascii=False, sort_keys=True))
    output = redact_secrets("\n".join(parts))
    return output if len(output) <= limit else f"{output[:limit]}\n...[MCP output truncated]"


def _identifier(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "_", value)


def _risk(value: str) -> RiskLevel:
    try:
        return RiskLevel(value)
    except ValueError:
        return RiskLevel.HIGH
