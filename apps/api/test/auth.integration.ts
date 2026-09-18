/**
 * Basic tests for the auth flow: signup → login → refresh → /auth/me.
 * Run with: node --loader tsx test/auth.test.ts (or via `pnpm test` once
 * a proper Jest/Supertest harness is wired to a test database).
 *
 * Note: these assume the API is already running against a test MongoDB
 * instance — they are integration tests, not isolated unit tests, matching
 * the same style used in resilient-stack's test.js files.
 */
import assert from "assert";

const BASE = process.env.TEST_BASE_URL || "http://localhost:4000";

async function run() {
  console.log("Running auth tests against", BASE);

  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = "test-password-123";

  // SIGNUP
  let res = await fetch(`${BASE}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testEmail, password: testPassword, displayName: "Test User" }),
  });
  assert.strictEqual(res.status, 201, "expected 201 on signup");
  const signupBody = await res.json();
  assert.ok(signupBody.accessToken, "signup should return an accessToken");
  assert.ok(signupBody.refreshToken, "signup should return a refreshToken");
  console.log("✓ POST /auth/signup creates a user and returns tokens");

  // DUPLICATE SIGNUP should fail
  res = await fetch(`${BASE}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testEmail, password: testPassword, displayName: "Test User" }),
  });
  assert.strictEqual(res.status, 409, "expected 409 on duplicate signup");
  console.log("✓ POST /auth/signup rejects a duplicate email");

  // LOGIN
  res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });
  assert.strictEqual(res.status, 200, "expected 200 on login");
  const loginBody = await res.json();
  assert.ok(loginBody.accessToken, "login should return an accessToken");
  console.log("✓ POST /auth/login returns tokens for valid credentials");

  // LOGIN with wrong password
  res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testEmail, password: "wrong-password" }),
  });
  assert.strictEqual(res.status, 401, "expected 401 on wrong password");
  console.log("✓ POST /auth/login rejects an incorrect password");

  // /auth/me with a valid access token
  res = await fetch(`${BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${loginBody.accessToken}` },
  });
  assert.strictEqual(res.status, 200, "expected 200 on /auth/me with valid token");
  const meBody = await res.json();
  assert.strictEqual(meBody.email, testEmail);
  console.log("✓ GET /auth/me returns the logged-in user's profile");

  // /auth/me with no token
  res = await fetch(`${BASE}/auth/me`);
  assert.strictEqual(res.status, 401, "expected 401 with no Authorization header");
  console.log("✓ GET /auth/me rejects requests with no token");

  // REFRESH
  res = await fetch(`${BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: loginBody.refreshToken }),
  });
  assert.strictEqual(res.status, 200, "expected 200 on refresh");
  const refreshBody = await res.json();
  assert.ok(refreshBody.accessToken, "refresh should return a new accessToken");
  console.log("✓ POST /auth/refresh returns a new token pair");

  console.log("\nAll auth tests passed.");
}

run().catch((err) => {
  console.error("TEST FAILED:", err.message);
  process.exit(1);
});
