import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../config", () => ({
  env: { NODE_ENV: "test" },
  queryOne: vi.fn(),
  query: vi.fn(),
}));

vi.mock("../../utils/auth", () => ({
  hashPassword: vi.fn(async (p: string) => `hash(${p})`),
  verifyPassword: vi.fn(),
  signAccessToken: vi.fn((id: string) => `access(${id})`),
  signRefreshToken: vi.fn((id: string) => `refresh(${id})`),
  verifyRefreshToken: vi.fn(),
}));

import { queryOne } from "../../config";
import { verifyPassword, verifyRefreshToken } from "../../utils/auth";
import { AuthService } from "./auth.service";
import { ConflictError, UnauthorizedError, AppError } from "../../utils/errors";

const queryOneMock = queryOne as unknown as ReturnType<typeof vi.fn>;
const verifyPasswordMock = verifyPassword as unknown as ReturnType<typeof vi.fn>;
const verifyRefreshMock = verifyRefreshToken as unknown as ReturnType<typeof vi.fn>;

const profile = {
  id: "u1",
  username: "asha",
  name: "Asha",
  phone: null,
  role: "customer" as const,
  fcm_token: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

let service: AuthService;

beforeEach(() => {
  vi.clearAllMocks();
  service = new AuthService();
});

describe("AuthService.register", () => {
  it("inserts a profile and returns tokens + user", async () => {
    queryOneMock.mockResolvedValueOnce(profile);

    const result = await service.register("asha", "secret6", "Asha", "customer");

    expect(queryOneMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO profiles"),
      ["asha", "hash(secret6)", "Asha", "customer"],
    );
    expect(result).toEqual({
      accessToken: "access(u1)",
      refreshToken: "refresh(u1)",
      user: profile,
    });
  });

  it("maps Postgres unique_violation (23505) to ConflictError", async () => {
    const dupErr = Object.assign(new Error("duplicate key"), { code: "23505" });
    queryOneMock.mockRejectedValueOnce(dupErr);

    const p = service.register("asha", "secret6", undefined, "customer");
    await expect(p).rejects.toBeInstanceOf(ConflictError);
    await expect(p).rejects.toThrow("Username already taken");
  });

  it("surfaces other DB errors as 400 AppError", async () => {
    queryOneMock.mockRejectedValueOnce(new Error("db unavailable"));

    const p = service.register("asha", "secret6", undefined, "customer");
    await expect(p).rejects.toBeInstanceOf(AppError);
    await expect(p).rejects.toMatchObject({ statusCode: 400 });
    await expect(p).rejects.toThrow("db unavailable");
  });
});

describe("AuthService.login", () => {
  it("returns tokens and the profile on valid credentials", async () => {
    queryOneMock.mockResolvedValueOnce({ ...profile, password_hash: "hash(secret6)" });
    verifyPasswordMock.mockResolvedValueOnce(true);

    const result = await service.login("asha", "secret6");

    expect(queryOneMock).toHaveBeenCalledWith(
      expect.stringContaining("FROM profiles"),
      ["asha"],
    );
    expect(verifyPasswordMock).toHaveBeenCalledWith("secret6", "hash(secret6)");
    expect(result).toEqual({
      accessToken: "access(u1)",
      refreshToken: "refresh(u1)",
      user: profile,
    });
  });

  it("throws UnauthorizedError when the user does not exist", async () => {
    queryOneMock.mockResolvedValueOnce(null);

    await expect(service.login("ghost", "secret6")).rejects.toBeInstanceOf(UnauthorizedError);
    expect(verifyPasswordMock).not.toHaveBeenCalled();
  });

  it("throws UnauthorizedError when the password does not match", async () => {
    queryOneMock.mockResolvedValueOnce({ ...profile, password_hash: "hash(secret6)" });
    verifyPasswordMock.mockResolvedValueOnce(false);

    await expect(service.login("asha", "wrong")).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("AuthService.refreshToken", () => {
  it("returns a fresh token pair", async () => {
    verifyRefreshMock.mockReturnValueOnce({ sub: "u1", type: "refresh" });
    queryOneMock.mockResolvedValueOnce(profile);

    const result = await service.refreshToken("good-rt");

    expect(verifyRefreshMock).toHaveBeenCalledWith("good-rt");
    expect(result).toEqual({ accessToken: "access(u1)", refreshToken: "refresh(u1)" });
  });

  it("throws UnauthorizedError when the refresh token is invalid", async () => {
    verifyRefreshMock.mockImplementationOnce(() => {
      throw new Error("nope");
    });

    await expect(service.refreshToken("bad")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws UnauthorizedError when the user no longer exists", async () => {
    verifyRefreshMock.mockReturnValueOnce({ sub: "u-gone", type: "refresh" });
    queryOneMock.mockResolvedValueOnce(null);

    await expect(service.refreshToken("good-but-stale")).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });
});
