import { NextRequest, NextResponse } from "next/server";
import { serverApiUrl } from "@/app/lib/api-server";

type RouteParams = {
  path?: string[];
};

type RouteContext = {
  params: RouteParams | Promise<RouteParams>;
};

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function copyForwardHeaders(request: NextRequest) {
  const headers = new Headers();

  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  return headers;
}

function copyResponseHeaders(response: Response) {
  const headers = new Headers();

  response.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  return headers;
}

async function proxyToBackend(request: NextRequest, context: RouteContext) {
  const params = await Promise.resolve(context.params);
  const path = `/${(params.path || []).join("/")}`;
  const target = new URL(serverApiUrl(path));
  target.search = request.nextUrl.search;

  const method = request.method.toUpperCase();
  const init: RequestInit = {
    method,
    headers: copyForwardHeaders(request),
    cache: "no-store",
  };

  if (method !== "GET" && method !== "HEAD") {
    init.body = await request.text();
  }

  try {
    const response = await fetch(target, init);

    return new NextResponse(response.body, {
      status: response.status,
      headers: copyResponseHeaders(response),
    });
  } catch (error) {
    console.error("Backend proxy failed:", error);
    return NextResponse.json(
      { error: "Backend service unavailable" },
      { status: 502 }
    );
  }
}

export {
  proxyToBackend as DELETE,
  proxyToBackend as GET,
  proxyToBackend as HEAD,
  proxyToBackend as OPTIONS,
  proxyToBackend as PATCH,
  proxyToBackend as POST,
  proxyToBackend as PUT,
};
