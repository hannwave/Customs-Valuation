import assert from "node:assert/strict";
import test from "node:test";
import { acceptsDemoCredentials, DEMO_SESSION_KEY, readDemoSession, writeDemoSession } from "../lib/auth/demo-session.ts";

test("demo accepts arbitrary non-empty credentials without requiring an email or account", () => {
  assert.equal(acceptsDemoCredentials("demo", "demo"), true);
  assert.equal(acceptsDemoCredentials("anything", "1"), true);
  assert.equal(acceptsDemoCredentials("ሙከራ", "123"), true);
  assert.equal(acceptsDemoCredentials("", "demo"), false);
  assert.equal(acceptsDemoCredentials("demo", "  "), false);
  assert.equal(acceptsDemoCredentials("  ", "demo"), false);
});

test("access survives a session reload and sign-out clears it without storing credentials", () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  assert.equal(readDemoSession(storage), false);
  writeDemoSession(storage, true);
  assert.deepEqual([...values], [[DEMO_SESSION_KEY, "active"]]);
  assert.equal(readDemoSession(storage), true);
  writeDemoSession(storage, false);
  assert.equal(readDemoSession(storage), false);
  assert.equal(values.size, 0);
});

test("unknown or inaccessible storage does not restore access", () => {
  assert.equal(readDemoSession({ getItem: () => "false" }), false);
  assert.equal(readDemoSession({ getItem: () => { throw new Error("Storage blocked"); } }), false);
});
