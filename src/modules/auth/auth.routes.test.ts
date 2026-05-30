import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

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
import authRoutes from "./auth.routes";
import { errorHandler } from "../../middleware";

const queryOneMock = queryOne as unknown as ReturnType<typeof vi.fn>;
const verifyPasswordMock = verifyPassword as unknown as ReturnType<typeof vi.fn>;
const verifyRefreshMock = verifyRefreshToken as unknown as ReturnType<typeof vi.fn>;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  app.use(errorHandler);
  return app;
}

const app = buildApp();
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/register", () => {
  it("returns 201 with tokens and user on success", async () => {
    queryOneMock.mockResolvedValueOnce(profile);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "ASHA", password: "secret6", name: "Asha", role: "customer" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true,
      data: { accessToken: "access(u1)", refreshToken: "refresh(u1)", user: profile },
    });
    // Zod transform lowercases the username before the service sees it.
    expect(queryOneMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO profiles"),
      ["asha", "hash(secret6)", "Asha", "customer"],
    );
  });

  it("returns 400 with VALIDATION_ERROR for a too-short password", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "asha", password: "123", role: "customer" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(queryOneMock).not.toHaveBeenCalled();
  });

  it("returns 400 with VALIDATION_ERROR for an invalid role", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "asha", password: "secret6", role: "admin" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 409 with CONFLICT when the username is taken", async () => {
    const dupErr = Object.assign(new Error("duplicate key"), { code: "23505" });
    queryOneMock.mockRejectedValueOnce(dupErr);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "asha", password: "secret6", role: "customer" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(res.body.error.message).toBe("Username already taken");
  });
});

describe("POST /api/auth/login", () => {
  it("returns 200 with tokens and user on valid credentials", async () => {
    queryOneMock.mockResolvedValueOnce({ ...profile, password_hash: "hash(secret6)" });
    verifyPasswordMock.mockResolvedValueOnce(true);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "asha", password: "secret6" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { accessToken: "access(u1)", refreshToken: "refresh(u1)", user: profile },
    });
  });

  it("returns 401 on invalid credentials", async () => {
    queryOneMock.mockResolvedValueOnce({ ...profile, password_hash: "hash(real)" });
    verifyPasswordMock.mockResolvedValueOnce(false);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "asha", password: "wrong" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
    expect(res.body.error.message).toBe("Invalid username or password");
  });

  it("returns 400 with VALIDATION_ERROR when the password is missing", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "asha" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(queryOneMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/refresh", () => {
  it("returns 200 with a fresh token pair", async () => {
    verifyRefreshMock.mockReturnValueOnce({ sub: "u1", type: "refresh" });
    queryOneMock.mockResolvedValueOnce(profile);

    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: "rt" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { accessToken: "access(u1)", refreshToken: "refresh(u1)" },
    });
  });

  it("returns 401 on an invalid refresh token", async () => {
    verifyRefreshMock.mockImplementationOnce(() => {
      throw new Error("nope");
    });

    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: "bad" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 400 with VALIDATION_ERROR when refreshToken is missing", async () => {
    const res = await request(app).post("/api/auth/refresh").send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
