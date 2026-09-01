export function focusedChangePath(patch: string, changedFiles: string[]): string | undefined {
  return changedFiles[0] ?? firstPatchPath(patch);
}

export function focusedPatchHunk(patch: string, focusPath?: string): string | undefined {
  const chunks = patch.trim().split(/\n(?=diff --git )/g);
  for (const chunk of chunks) {
    const lines = chunk.split("\n");
    const path = patchChunkPath(lines);
    if (focusPath && path && path !== focusPath) continue;
    const hunk = lines.find((line) => line.startsWith("@@"));
    if (hunk) return hunk;
  }
  return patch.split("\n").find((line) => line.startsWith("@@"));
}

function firstPatchPath(patch: string): string | undefined {
  const plusPath = patch.match(/^\+\+\+\s+b\/(.+)$/m)?.[1];
  if (plusPath && plusPath !== "/dev/null") return plusPath.trim();
  const diffPath = patch.match(/^diff --git\s+a\/\S+\s+b\/(.+)$/m)?.[1];
  if (diffPath && diffPath !== "/dev/null") return diffPath.trim();
  const minusPath = patch.match(/^---\s+a\/(.+)$/m)?.[1];
  return minusPath && minusPath !== "/dev/null" ? minusPath.trim() : undefined;
}

function patchChunkPath(lines: string[]): string | undefined {
  for (const line of lines) {
    const git = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (git) return git[2].trim();
    const added = line.match(/^\+\+\+\s+(.+)$/);
    if (added && added[1] !== "/dev/null") return added[1].replace(/^b\//, "").trim();
    const removed = line.match(/^---\s+(.+)$/);
    if (removed && removed[1] !== "/dev/null") return removed[1].replace(/^a\//, "").trim();
  }
  return undefined;
}
