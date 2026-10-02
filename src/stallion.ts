// Minimal client for Stallion, the HTTP bridge that runs inside Cavalry (Scripts > Stallion).
// Host and port can be overridden with CAVALRY_HOST / CAVALRY_PORT (the .mcpb exposes the port as a setting).

const portFromEnv = Number(process.env.CAVALRY_PORT);

export const stallionConfig = {
  host: process.env.CAVALRY_HOST || "127.0.0.1",
  port: Number.isInteger(portFromEnv) && portFromEnv > 0 ? portFromEnv : 8080,
};

/** Sends JavaScript to Cavalry. Stallion does not return the script's result, see bridge.ts for that. */
export async function sendToCavalry(code: string): Promise<void> {
  const { host, port } = stallionConfig;
  const response = await fetch(`http://${host}:${port}/post`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "script", code }),
  });
  if (!response.ok) {
    throw new Error(`Stallion answered ${response.status}: ${await response.text()}`);
  }
}
