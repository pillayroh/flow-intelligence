import * as https from "node:https";
import * as http from "node:http";
import { URL } from "node:url";

export interface HttpResponse {
  status: number;
  body: string;
}

// Minimal JSON POST using Node's built-in http(s) so we avoid any dependency on
// a global fetch being present in the host runtime.
export function postJson(
  urlStr: string,
  body: unknown,
  headers: Record<string, string> = {},
  timeoutMs = 8000,
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === "http:" ? http : https;
    const data = JSON.stringify(body);
    const req = lib.request(
      {
        method: "POST",
        hostname: url.hostname,
        port: url.port || (url.protocol === "http:" ? 80 : 443),
        path: url.pathname + url.search,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          ...headers,
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c as Buffer));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("request_timeout"));
    });
    req.write(data);
    req.end();
  });
}
