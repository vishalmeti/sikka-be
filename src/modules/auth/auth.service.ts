import { supabaseAdmin, supabaseAuth } from "../../config";
import { AppError, ConflictError, UnauthorizedError } from "../../utils/errors";

// Supabase Auth identifies users by email, so we map each username to a
// stable synthetic email. No mail is ever sent — the account is created
// pre-confirmed and the password is hashed/stored by Supabase in auth.users.
const USERNAME_EMAIL_DOMAIN = "sikka.local";
const emailForUsername = (username: string) => `${username}@${USERNAME_EMAIL_DOMAIN}`;

export class AuthService {
  async register(
    username: string,
    password: string,
    name: string | undefined,
    role: "customer" | "owner"
  ) {
    const email = emailForUsername(username);

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username, role },
    });

    if (createErr || !created?.user) {
      const msg = createErr?.message?.toLowerCase() ?? "";
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        throw new ConflictError("Username already taken");
      }
      throw new AppError(400, createErr?.message ?? "Could not create account");
    }

    const userId = created.user.id;

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .insert({ id: userId, username, name, role })
      .select()
      .single();

    if (profileErr) {
      // Roll back the orphaned auth user so the username can be retried.
      await supabaseAdmin.auth.admin.deleteUser(userId);
      if (profileErr.code === "23505") throw new ConflictError("Username already taken");
      throw new AppError(400, profileErr.message);
    }

    const session = await this.passwordSignIn(email, password);
    return { ...session, user: profile };
  }

  async login(username: string, password: string) {
    const email = emailForUsername(username);
    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });

    if (error || !data.session || !data.user) {
      throw new UnauthorizedError("Invalid username or password");
    }

    const profile = await this.getProfile(data.user.id);
    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: profile,
    };
  }

  async refreshToken(refreshToken: string) {
    const { data, error } = await supabaseAuth.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) throw new UnauthorizedError("Invalid refresh token");

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    };
  }

  private async passwordSignIn(email: string, password: string) {
    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new AppError(500, "Could not establish session");
    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    };
  }

  private async getProfile(userId: string) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    return data;
  }
}
