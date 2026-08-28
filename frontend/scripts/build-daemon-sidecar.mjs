import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";


const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryDir = resolve(frontendDir, "..");
const backendDir = join(repositoryDir, "backend");
const python = process.platform === "win32"
  ? join(backendDir, ".venv", "Scripts", "python.exe")
  : join(backendDir, ".venv", "bin", "python");
const rustc = resolveRustc();

if (!existsSync(python)) {
  throw new Error(`Backend virtual environment is missing at ${python}`);
}

const buildRoot = join(frontendDir, "desktop-build");
const distDir = join(buildRoot, "dist");
const workDir = join(buildRoot, "pyinstaller");
rmSync(buildRoot, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

execFileSync(
  python,
  [
    "-m",
    "PyInstaller",
    join(backendDir, "desktop_daemon.spec"),
    "--noconfirm",
    "--clean",
    "--distpath",
    distDir,
    "--workpath",
    workDir,
  ],
  {
    cwd: backendDir,
    stdio: "inherit",
    env: {
      ...process.env,
      PYINSTALLER_CONFIG_DIR: join(buildRoot, "cache"),
    },
  },
);

const triple = execFileSync(rustc, ["--print", "host-tuple"], { encoding: "utf8" }).trim();
if (!triple) throw new Error("rustc did not return a host target triple");

const extension = process.platform === "win32" ? ".exe" : "";
const built = join(distDir, `miniagentos-daemon${extension}`);
const binariesDir = join(frontendDir, "src-tauri", "binaries");
const target = join(binariesDir, `miniagentos-daemon-${triple}${extension}`);
if (!existsSync(built)) throw new Error(`PyInstaller output is missing at ${built}`);

mkdirSync(binariesDir, { recursive: true });
copyFileSync(built, target);
if (process.platform !== "win32") chmodSync(target, 0o755);
console.log(`Prepared Tauri sidecar: ${target}`);

function resolveRustc() {
  const candidates = [
    process.env.RUSTC,
    "rustc",
    "/opt/homebrew/opt/rustup/bin/rustc",
    join(homedir(), ".cargo", "bin", process.platform === "win32" ? "rustc.exe" : "rustc"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["--version"], { stdio: "ignore" });
      return candidate;
    } catch {
      // Try the next standard toolchain location.
    }
  }
  throw new Error("rustc is required to name the Tauri sidecar for the current target");
}
