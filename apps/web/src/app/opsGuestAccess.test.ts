import { afterEach, describe, expect, it } from "vitest";

import {
  consumePostLoginPath,
  isSafeOpsReturnPath,
  savePostLoginPath,
} from "./opsGuestAccess";

const POST_LOGIN_PATH_KEY = "metaview:post-login-path";

describe("opsGuestAccess return-path whitelist", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("admits /admin as a safe post-login return path", () => {
    expect(isSafeOpsReturnPath("/admin")).toBe(true);
  });

  it("round-trips /admin through savePostLoginPath / consumePostLoginPath", () => {
    savePostLoginPath("/admin");
    expect(sessionStorage.getItem(POST_LOGIN_PATH_KEY)).toBe("/admin");
    expect(consumePostLoginPath()).toBe("/admin");
    // Consume is one-shot: a second call has nothing to return.
    expect(consumePostLoginPath()).toBeNull();
  });

  it("still rejects non-whitelisted paths to preserve the redirect-safety guarantee", () => {
    savePostLoginPath("/evil");
    expect(sessionStorage.getItem(POST_LOGIN_PATH_KEY)).toBeNull();
    expect(consumePostLoginPath()).toBeNull();
  });
});