import { NextResponse } from "next/server";

const ALLOWED_METHODS = "GET,POST,PATCH,PUT,DELETE,OPTIONS";
const ALLOWED_HEADERS =
  "Content-Type, Authorization, X-Requested-With, X-Teacher-Pin, If-None-Match, If-Modified-Since, Accept, Range";

/**
 * Build CORS headers. Uses the CORS_ORIGIN env var (comma separated list) or "*" by default,
 * so a separately hosted frontend (e.g. React/Vite) can talk to these serverless endpoints.
 */
export function corsHeaders(requestOrigin?: string | null): Record<string, string> {
  const configured = (process.env.CORS_ORIGIN ?? "*").trim();
  let origin = "*";
  if (configured !== "*") {
    const list = configured.split(",").map((o) => o.trim()).filter(Boolean);
    origin = requestOrigin && list.includes(requestOrigin) ? requestOrigin : list[0] ?? "*";
  }
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Expose-Headers": "ETag, Content-Length, Content-Type, Last-Modified, Cache-Control, X-Sound-Key",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin !== "*") headers["Access-Control-Allow-Credentials"] = "true";
  return headers;
}

export function withCors<T extends Response>(res: T, req?: Request): T {
  const headers = corsHeaders(req?.headers.get("origin"));
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

export function json(body: unknown, init: ResponseInit & { req?: Request } = {}) {
  const { req, ...rest } = init;
  const res = NextResponse.json(body, rest);
  return withCors(res, req);
}

export function error(message: string, status = 400, req?: Request, extra?: Record<string, unknown>) {
  return json({ ok: false, error: message, ...extra }, { status, req });
}

export function preflight(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}
