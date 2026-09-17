const SINGLE_SESSION_PACKAGE_NAME = "single session";

function isSingleSessionPackage(pkg: { name: string }): boolean {
  return pkg.name.trim().toLowerCase() === SINGLE_SESSION_PACKAGE_NAME;
}

/**
 * Move the "Single Session" package to the front so it's listed first and
 * picked as the default when creating a pending payment for a zero-balance
 * player. Other packages keep their order.
 */
export function withSingleSessionFirst<T extends { name: string }>(packages: T[]): T[] {
  return [...packages.filter(isSingleSessionPackage), ...packages.filter((p) => !isSingleSessionPackage(p))];
}
