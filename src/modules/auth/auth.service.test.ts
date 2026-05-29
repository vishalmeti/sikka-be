import { describe, it, expect, beforeEach, vi } from "vitest";

// A chainable query-builder stub. Every chain method returns the same builder
// so `.from(...).insert(...).select().single()` and
// `.from(...).select(...).eq(...).single()` both terminate at `single`.
vi.mock("../../config", () => {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.insert = vi.fn(() => builder);
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.single = vi.fn();
  return {
    env: { NODE_ENV: "test" },
    supabaseAdmin: {
      auth: { admin: { createUser: vi.fn(), deleteUser: vi.fn() } },
      from: vi.fn(() => builder),
    },
    supabaseAuth: {
      auth: { signInWithPassword: vi.fn(), refreshSession: vi.fn() },
    },
  };
});

import { supabaseAdmin, supabaseAuth } from "../../config";
import { AuthService } from "./auth.service";
import { ConflictError, UnauthorizedError, AppError } from "../../utils/errors";

const admin = supabaseAdmin as any;
const auth = supabaseAuth as any;
const builder = admin.from();

const createUser = admin.auth.admin.createUser as ReturnType<typeof vi.fn>;
const deleteUser = admin.auth.admin.deleteUser as ReturnType<typeof vi.fn>;
const signIn = auth.auth.signInWithPassword as ReturnType<typeof vi.fn>;
const refreshSession = auth.auth.refreshSession as ReturnType<typeof vi.fn>;
const single = builder.single as ReturnType<typeof vi.fn>;

const profile = { id: "u1", username: "asha", name: "Asha", role: "customer" };
const session = { access_token: "at", refresh_token: "rt" };

let service: AuthService;

beforeEach(() => {
  vi.clearAllMocks();
  service = new AuthService();
});

describe("AuthService.register", () => {
  it("creates the auth user, inserts a profile, and returns a session", async () => {
    createUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    single.mockResolvedValue({ data: profile, error: null });
    signIn.mockResolvedValue({ data: { session }, error: null });

    const result = await service.register("asha", "secret6", "Asha", "customer");

    expect(createUser).toHaveBeenCalledWith({
      email: "asha@sikka.local",
      password: "secret6",
      email_confirm: true,
      user_metadata: { username: "asha", role: "customer" },
    });
    expect(admin.from).toHaveBeenCalledWith("profiles");
    expect(builder.insert).toHaveBeenCalledWith({
      id: "u1",
      username: "asha",
      name: "Asha",
      role: "customer",
    });
    expect(signIn).toHaveBeenCalledWith({ email: "asha@sikka.local", password: "secret6" });
    expect(result).toEqual({ accessToken: "at", refreshToken: "rt", user: profile });
  });

  it("maps a duplicate-user auth error to a ConflictError without touching profiles", async () => {
    createUser.mockResolvedValue({
      data: null,
      error: { message: "A user with this email has already been registered" },
    });

    await expect(service.register("asha", "secret6", undefined, "customer")).rejects.toBeInstanceOf(
      ConflictError
    );
    await expect(service.register("asha", "secret6", undefined, "customer")).rejects.toThrow(
      "Username already taken"
    );
    expect(builder.insert).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("surfaces a non-duplicate auth error as a 400 AppError", async () => {
    createUser.mockResolvedValue({ data: null, error: { message: "weak password" } });

    const p = service.register("asha", "secret6", undefined, "customer");
    await expect(p).rejects.toBeInstanceOf(AppError);
    await expect(p).rejects.toMatchObject({ statusCode: 400 });
    await expect(p).rejects.toThrow("weak password");
  });

  it("throws a 400 when the auth user is missing with no error", async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: null });

    const p = service.register("asha", "secret6", undefined, "customer");
    await expect(p).rejects.toMatchObject({ statusCode: 400 });
    await expect(p).rejects.toThrow("Could not create account");
  });

  it("rolls back the auth user and throws ConflictError on a unique-violation profile insert", async () => {
    createUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    single.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key" } });

    await expect(
      service.register("asha", "secret6", "Asha", "customer")
    ).rejects.toBeInstanceOf(ConflictError);
    expect(deleteUser).toHaveBeenCalledWith("u1");
    expect(signIn).not.toHaveBeenCalled();
  });

  it("rolls back the auth user and throws a 400 on any other profile insert error", async () => {
    createUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    single.mockResolvedValue({ data: null, error: { code: "XXALL", message: "db unavailable" } });

    const p = service.register("asha", "secret6", "Asha", "customer");
    await expect(p).rejects.toMatchObject({ statusCode: 400 });
    await expect(p).rejects.toThrow("db unavailable");
    expect(deleteUser).toHaveBeenCalledWith("u1");
  });

  it("throws a 500 when the post-register sign-in cannot establish a session", async () => {
    createUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    single.mockResolvedValue({ data: profile, error: null });
    signIn.mockResolvedValue({ data: { session: null }, error: { message: "no session" } });

    const p = service.register("asha", "secret6", "Asha", "customer");
    await expect(p).rejects.toMatchObject({ statusCode: 500 });
    await expect(p).rejects.toThrow("Could not establish session");
  });
});

describe("AuthService.login", () => {
  it("returns tokens and the profile on valid credentials", async () => {
    signIn.mockResolvedValue({ data: { session, user: { id: "u1" } }, error: null });
    single.mockResolvedValue({ data: profile, error: null });

    const result = await service.login("asha", "secret6");

    expect(signIn).toHaveBeenCalledWith({ email: "asha@sikka.local", password: "secret6" });
    expect(result).toEqual({ accessToken: "at", refreshToken: "rt", user: profile });
  });

  it("throws UnauthorizedError when Supabase reports an error", async () => {
    signIn.mockResolvedValue({ data: { session: null, user: null }, error: { message: "bad" } });

    const p = service.login("asha", "wrong");
    await expect(p).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(p).rejects.toThrow("Invalid username or password");
  });

  it("throws UnauthorizedError when no session is returned", async () => {
    signIn.mockResolvedValue({ data: { session: null, user: { id: "u1" } }, error: null });

    await expect(service.login("asha", "secret6")).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("AuthService.refreshToken", () => {
  it("returns a fresh token pair", async () => {
    refreshSession.mockResolvedValue({
      data: { session: { access_token: "at2", refresh_token: "rt2" } },
      error: null,
    });

    const result = await service.refreshToken("rt");

    expect(refreshSession).toHaveBeenCalledWith({ refresh_token: "rt" });
    expect(result).toEqual({ accessToken: "at2", refreshToken: "rt2" });
  });

  it("throws UnauthorizedError on an invalid refresh token", async () => {
    refreshSession.mockResolvedValue({ data: { session: null }, error: { message: "nope" } });

    const p = service.refreshToken("bad");
    await expect(p).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(p).rejects.toThrow("Invalid refresh token");
  });
});
