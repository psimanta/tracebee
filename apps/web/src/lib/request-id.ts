import { randomUUID } from "node:crypto";

const CLIENT_ID = /^[A-Za-z0-9_-]{8,128}$/;

export function requestIdFrom(req: Request): string {
  const supplied = req.headers.get("x-request-id");
  if (supplied && CLIENT_ID.test(supplied)) return supplied;
  return randomUUID();
}
