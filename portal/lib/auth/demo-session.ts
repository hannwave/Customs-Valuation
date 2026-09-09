// Temporary UI access only. This flag is never an API token or a user role.
// Replace this module and DemoSessionProvider when real authentication is available.
export const DEMO_SESSION_KEY = "ses-customs-demo-session";

export function acceptsDemoCredentials(identifier: string, password: string) {
  return identifier.trim().length > 0 && password.trim().length > 0;
}

export function readDemoSession(storage: Pick<Storage, "getItem">) {
  try { return storage.getItem(DEMO_SESSION_KEY) === "active"; }
  catch { return false; }
}

export function writeDemoSession(storage: Pick<Storage, "setItem" | "removeItem">, active: boolean) {
  if (active) storage.setItem(DEMO_SESSION_KEY, "active");
  else storage.removeItem(DEMO_SESSION_KEY);
}
