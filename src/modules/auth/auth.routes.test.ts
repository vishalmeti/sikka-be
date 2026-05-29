import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../config", () => {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.insert = vi.fn(() => builder);
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.single = vi.fn();
  return {
    env: { NODE_ENV: "test" },
    supabaseAdmin: {
      auth: { admin: { createUser: vi.fn(), deleteUser: vi.fn() }, getUser: vi.fn() },
      from: vi.fn(() => builder),
    },
    supabaseAuth: {
      auth: { signInWithPassword: vi.fn(), refreshSession: vi.fn() },
    },
  };
});

import { supabaseAdmin, supabaseAuth } from "../../config";
import authRoutes from "./auth.routes";
import { errorHandler } from "../../middleware";

const admin = supabaseAdmin as any;
const auth = supabaseAuth as any;
const builder = admin.from();

const createUser = admin.auth.admin.createUser as ReturnType<typeof vi.fn>;
const signIn = auth.auth.signInWithPassword as ReturnType<typeof vi.fn>;
const refreshSession = auth.auth.refreshSession as ReturnType<typeof vi.fn>;
const single = builder.single as ReturnType<typeof vi.fn>;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  app.use(errorHandler);
  return app;
}

const app = buildApp();
const profile = { id: "u1", username: "asha", name: "Asha", role: "customer" };
const session = { access_token: "at", refresh_token: "rt" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/register", () => {
  it("returns 201 with tokens and user on success", async () => {
    createUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    single.mockResolvedValue({ data: profile, error: null });
    signIn.mockResolvedValue({ data: { session }, error: null });

    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "ASHA", password: "secret6", name: "Asha", role: "customer" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true,
      data: { accessToken: "at", refreshToken: "rt", user: profile },
    });
    // The Zod transform lowercases the username before it reaches the service.
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "asha@sikka.local" })
    );
  });

  it("returns 400 with VALIDATION_ERROR for a too-short password", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "asha", password: "123", role: "customer" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(createUser).not.toHaveBeenCalled();
  });

  it("returns 400 with VALIDATION_ERROR for an invalid role", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "asha", password: "secret6", role: "admin" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 409 with CONFLICT when the username is taken", async () => {
    createUser.mockResolvedValue({
      data: null,
      error: { message: "A user with this email has already been registered" },
    });

    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "asha", password: "secret6", role: "customer" });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(res.body.error.message).toBe("Username already taken");
  });
});

describe("POST /api/auth/login", () => {
  it("returns 200 with tokens and user on valid credentials", async () => {
    signIn.mockResolvedValue({ data: { session, user: { id: "u1" } }, error: null });
    single.mockResolvedValue({ data: profile, error: null });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "asha", password: "secret6" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { accessToken: "at", refreshToken: "rt", user: profile },
    });
  });

  it("returns 401 on invalid credentials", async () => {
    signIn.mockResolvedValue({ data: { session: null, user: null }, error: { message: "bad" } });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "asha", password: "wrong" });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
    expect(res.body.error.message).toBe("Invalid username or password");
  });

  it("returns 400 with VALIDATION_ERROR when the password is missing", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "asha" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(signIn).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/refresh", () => {
  it("returns 200 with a fresh token pair", async () => {
    refreshSession.mockResolvedValue({
      data: { session: { access_token: "at2", refresh_token: "rt2" } },
      error: null,
    });

    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: "rt" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { accessToken: "at2", refreshToken: "rt2" },
    });
  });

  it("returns 401 on an invalid refresh token", async () => {
    refreshSession.mockResolvedValue({ data: { session: null }, error: { message: "nope" } });

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
