import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const virtualEnvironment = path.join(root, ".data", "whisper-venv");
const python = path.join(virtualEnvironment, "bin", "python");

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function run(command, args) {
  console.log(`> ${command} ${args.join(" ")}`);
  await execFileAsync(command, args, { stdio: "inherit", maxBuffer: 8 * 1024 * 1024 });
}

await mkdir(path.join(root, ".data"), { recursive: true });
if (!(await exists(python))) {
  const candidates = [
    process.env.WHISPER_BOOTSTRAP_PYTHON,
    process.arch === "arm64" ? "/opt/homebrew/bin/python3.12" : null,
    "/usr/local/bin/python3.12",
    "python3",
  ].filter(Boolean);
  let bootstrapPython = null;
  for (const candidate of candidates) {
    if (candidate.includes("/") && !(await exists(candidate))) continue;
    bootstrapPython = candidate;
    break;
  }
  if (!bootstrapPython) throw new Error("Python 3 non trovato. Installa Python 3.12 e riprova.");
  await run(bootstrapPython, ["-m", "venv", virtualEnvironment]);
}

await run(python, ["-m", "pip", "install", "--upgrade", "pip"]);
await run(python, ["-m", "pip", "install", "faster-whisper"]);
console.log(`Whisper locale pronto. Modello predefinito: base. Ambiente: ${virtualEnvironment}`);
