from __future__ import annotations

import json
import sys


RULES = {
    "ca": "CA tax rate is 7.5 percent.",
    "ny": "NY tax rate is 8.875 percent.",
    "or": "OR tax rate is 0 percent and digital goods are exempt.",
    "rounding": "Tax is rounded half-up to the nearest cent after discounts.",
}


def respond(message_id, result):
    print(json.dumps({"jsonrpc": "2.0", "id": message_id, "result": result}), flush=True)


for line in sys.stdin:
    message = json.loads(line)
    if "id" not in message:
        continue
    method = message.get("method")
    if method == "initialize":
        respond(message["id"], {
            "protocolVersion": "2024-11-05",
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "invoice-rules", "version": "1.0"},
        })
    elif method == "tools/list":
        respond(message["id"], {
            "tools": [
                {
                    "name": "lookup_rule",
                    "description": "Return a regional invoice rule by key.",
                    "inputSchema": {
                        "type": "object",
                        "properties": {"key": {"type": "string"}},
                        "required": ["key"],
                    },
                }
            ]
        })
    elif method == "tools/call":
        arguments = message.get("params", {}).get("arguments", {})
        key = str(arguments.get("key", "")).strip().lower()
        text = RULES.get(key, "No matching rule.")
        respond(message["id"], {"content": [{"type": "text", "text": text}]})
    else:
        print(json.dumps({
            "jsonrpc": "2.0",
            "id": message["id"],
            "error": {"code": -32601, "message": "method not found"},
        }), flush=True)
