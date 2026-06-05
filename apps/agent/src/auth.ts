export function hasValidSharedToken(
  configuredToken: string | undefined,
  providedToken: string | undefined,
): boolean {
  if (!configuredToken) return true;
  return providedToken === configuredToken;
}
