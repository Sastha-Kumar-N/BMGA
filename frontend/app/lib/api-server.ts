const DEFAULT_BACKEND_URL = "http://localhost:3001";

export function serverApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const baseUrl = (
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    DEFAULT_BACKEND_URL
  ).replace(/\/$/, "");

  return `${baseUrl}/api${normalizedPath}`;
}
