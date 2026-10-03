import { request } from "node:http";
import { localOllamaUrl } from "../retrieval/ollama";

/** Node HTTP avoids Electron renderer CORS. Restricted to Ollama's loopback JSON routes. */
export const localOllamaFetch: typeof fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
  );
  localOllamaUrl(url.origin);
  if (
    !["/api/tags", "/api/embed"].includes(url.pathname) ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new Error("Unsupported local embedding route");
  const signal = init?.signal;
  signal?.throwIfAborted();
  return new Promise<Response>((resolve, reject) => {
    const req = request(
      url,
      { method: init?.method ?? "GET", headers: { "Content-Type": "application/json" } },
      (response) => {
        const parts: Buffer[] = [];
        let bytes = 0;
        response.on("data", (part: Buffer) => {
          bytes += part.length;
          if (bytes > 16 * 1024 * 1024)
            req.destroy(new Error("Local embedding response too large"));
          else parts.push(part);
        });
        response.on("error", reject);
        response.on("end", () => {
          const status = response.statusCode ?? 500;
          if (status >= 300 && status < 400)
            reject(new Error("Local embedding redirects are forbidden"));
          else resolve(new Response(Buffer.concat(parts).toString("utf8"), { status }));
        });
      },
    );
    const abort = () =>
      req.destroy(
        signal?.reason instanceof Error ? signal.reason : new Error("Local embedding cancelled"),
      );
    signal?.addEventListener("abort", abort, { once: true });
    req.on("close", () => signal?.removeEventListener("abort", abort));
    req.on("error", reject);
    req.setTimeout(120_000, () => req.destroy(new Error("Local embedding request timed out")));
    if (typeof init?.body === "string") req.write(init.body);
    req.end();
  });
};
