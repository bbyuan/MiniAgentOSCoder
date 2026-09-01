from __future__ import annotations

import os


print(f"demo hook observed {os.environ.get('MINIAGENTOS_EVENT', 'unknown')} for {os.environ.get('MINIAGENTOS_RUN_ID', 'run')}")
