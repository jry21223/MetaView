import { timingSafeEqual } from "node:crypto";

export function hasValidSharedToken(
  configuredToken: string | undefined,
  providedToken: string | undefined,
): boolean {
  if (!configuredToken) return true;
  if (providedToken === undefined) return false;
  const expected = Buffer.from(configuredToken, "utf8");
  const actual = Buffer.from(providedToken, "utf8");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
