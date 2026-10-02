import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { randomUUID } from "crypto";
import { sendToCavalry, stallionConfig } from "./stallion.js";
import { buildWrapper } from "./scripts.js";

export interface Outcome {
  text: string;
  isError: boolean;
  pngBase64?: string;
}

interface Envelope {
  ok: boolean;
  noResult: boolean;
  result: unknown;
  logs: string[];
  error: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Forward slashes work on Windows and macOS and avoid escaping problems inside the JS string.
const tempFile = (prefix: string, ext: string) =>
  path.join(os.tmpdir(), `${prefix}_${randomUUID()}.${ext}`).replace(/\\/g, "/");

function format(env: Envelope): Outcome {
  const parts: string[] = [];
  if (env.logs?.length) parts.push("[console]\n" + env.logs.join("\n"));
  if (!env.ok) parts.push("Error in script: " + env.error);
  else if (env.noResult) parts.push("(script returned no value: end it with an expression or use console.log)");
  else parts.push(typeof env.result === "string" ? env.result : JSON.stringify(env.result, null, 2));
  return { text: parts.join("\n\n"), isError: !env.ok };
}

/**
 * Stallion accepts scripts but does not return their result, so the script writes a JSON envelope
 * to a temp file (api.writeToFile) and we poll for it.
 */
export async function runScript(code: string, timeoutMs = 10000): Promise<Outcome> {
  const outFile = tempFile("cavalry_out", "json");
  try {
    await sendToCavalry(buildWrapper(code, outFile));
  } catch (err: unknown) {
    const { host, port } = stallionConfig;
    const detail = err instanceof Error ? err.message : String(err);
    return {
      text: `Cannot reach Cavalry at http://${host}:${port}. In Cavalry open Scripts > Stallion and check that it says "Listening on ${host}:${port}". (${detail})`,
      isError: true,
    };
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let raw = "";
    try {
      raw = await fs.readFile(outFile, "utf8");
    } catch {
      /* not written yet */
    }
    if (raw.trim()) {
      try {
        const env = JSON.parse(raw) as Envelope;
        await fs.unlink(outFile).catch(() => {});
        return format(env);
      } catch {
        /* half-written file: try again */
      }
    }
    await sleep(50);
  }
  return {
    text: `Timeout: no response from Cavalry within ${timeoutMs} ms. The script may still be running, or Cavalry's scripting licence may block it.`,
    isError: true,
  };
}

/** Renders the current frame to PNG. api.renderPNGFrame takes its scale in PERCENT (100 = full size). */
export async function renderFrame(scale: number): Promise<Outcome> {
  const png = tempFile("cavalry_frame", "png");
  const outcome = await runScript(
    `api.renderPNGFrame(${JSON.stringify(png)}, ${scale * 100}); api.filePathExists(${JSON.stringify(png)});`,
  );
  if (outcome.isError) return outcome;
  try {
    const buf = await fs.readFile(png);
    await fs.unlink(png).catch(() => {});
    return { ...outcome, pngBase64: buf.toString("base64") };
  } catch {
    return { text: "Render failed: the PNG file was not found.", isError: true };
  }
}
