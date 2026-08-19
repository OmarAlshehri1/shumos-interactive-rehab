const TOP_LEVEL_CONTROL_PATHS = new Set(["/control", "/control/activities", "/control/patients", "/control/quick-session"]);

export function isTopLevelControlPath(pathname: string): boolean {
  return TOP_LEVEL_CONTROL_PATHS.has(pathname.replace(/\/$/, "") || "/");
}

export function shouldShowLogout(pathname: string): boolean {
  return isTopLevelControlPath(pathname);
}
