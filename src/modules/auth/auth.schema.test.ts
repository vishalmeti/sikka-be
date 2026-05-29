import { describe, it, expect } from "vitest";
import { registerSchema, loginSchema, refreshTokenSchema } from "./auth.schema";

describe("registerSchema", () => {
  const valid = {
    username: "asha_01",
    password: "secret6",
    name: "Asha",
    role: "customer" as const,
  };

  it("accepts a valid customer payload", () => {
    const parsed = registerSchema.parse(valid);
    expect(parsed).toMatchObject({
      username: "asha_01",
      password: "secret6",
      name: "Asha",
      role: "customer",
    });
  });

  it("accepts the owner role", () => {
    expect(registerSchema.parse({ ...valid, role: "owner" }).role).toBe("owner");
  });

  it("lowercases and trims the username", () => {
    const parsed = registerSchema.parse({ ...valid, username: "  AsHa_01  " });
    expect(parsed.username).toBe("asha_01");
  });

  it("trims the name", () => {
    const parsed = registerSchema.parse({ ...valid, name: "  Asha Devi  " });
    expect(parsed.name).toBe("Asha Devi");
  });

  it("treats name as optional", () => {
    const { name, ...withoutName } = valid;
    expect(registerSchema.safeParse(withoutName).success).toBe(true);
  });

  it("rejects a username shorter than 3 characters", () => {
    expect(registerSchema.safeParse({ ...valid, username: "ab" }).success).toBe(false);
  });

  it("rejects a username longer than 20 characters", () => {
    expect(
      registerSchema.safeParse({ ...valid, username: "a".repeat(21) }).success
    ).toBe(false);
  });

  it("rejects a username with disallowed characters", () => {
    for (const bad of ["bad name", "bad-name", "bad.name", "bad@name"]) {
      expect(registerSchema.safeParse({ ...valid, username: bad }).success).toBe(false);
    }
  });

  it("rejects a password shorter than 6 characters", () => {
    expect(registerSchema.safeParse({ ...valid, password: "12345" }).success).toBe(false);
  });

  it("rejects a password longer than 72 characters", () => {
    expect(
      registerSchema.safeParse({ ...valid, password: "a".repeat(73) }).success
    ).toBe(false);
  });

  it("rejects a name with a single character", () => {
    expect(registerSchema.safeParse({ ...valid, name: "A" }).success).toBe(false);
  });

  it("rejects an unknown role", () => {
    expect(registerSchema.safeParse({ ...valid, role: "admin" }).success).toBe(false);
  });

  it("rejects a missing role", () => {
    const { role, ...withoutRole } = valid;
    expect(registerSchema.safeParse(withoutRole).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("lowercases and trims the username", () => {
    const parsed = loginSchema.parse({ username: "  AsHa  ", password: "secret6" });
    expect(parsed.username).toBe("asha");
    expect(parsed.password).toBe("secret6");
  });

  it("rejects an empty username", () => {
    expect(loginSchema.safeParse({ username: "", password: "secret6" }).success).toBe(false);
  });

  it("rejects an empty password", () => {
    expect(loginSchema.safeParse({ username: "asha", password: "" }).success).toBe(false);
  });
});

describe("refreshTokenSchema", () => {
  it("accepts a non-empty token", () => {
    expect(refreshTokenSchema.safeParse({ refreshToken: "tok" }).success).toBe(true);
  });

  it("rejects an empty or missing token", () => {
    expect(refreshTokenSchema.safeParse({ refreshToken: "" }).success).toBe(false);
    expect(refreshTokenSchema.safeParse({}).success).toBe(false);
  });
});
