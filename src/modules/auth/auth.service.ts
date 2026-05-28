import { supabaseAdmin } from "../../config";
import { AppError, ConflictError, UnauthorizedError } from "../../utils/errors";

export class AuthService {
  async sendOtp(phone: string) {
    const { error } = await supabaseAdmin.auth.signInWithOtp({ phone });
    if (error) throw new AppError(400, error.message);
    return { message: "OTP sent successfully" };
  }

  async verifyOtp(phone: string, otp: string) {
    const { data, error } = await supabaseAdmin.auth.verifyOtp({
      phone,
      token: otp,
      type: "sms",
    });

    if (error) throw new UnauthorizedError("Invalid OTP");

    const profile = await this.getProfile(data.user!.id);

    return {
      accessToken: data.session!.access_token,
      refreshToken: data.session!.refresh_token,
      user: profile,
    };
  }

  async signup(phone: string, otp: string, name: string | undefined, role: "customer" | "owner") {
    const { data, error } = await supabaseAdmin.auth.verifyOtp({
      phone,
      token: otp,
      type: "sms",
    });

    if (error) throw new UnauthorizedError("Invalid OTP");

    const userId = data.user!.id;

    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .single();

    if (existing) throw new ConflictError("Profile already exists");

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .insert({ id: userId, phone, name, role })
      .select()
      .single();

    if (profileErr) throw new AppError(400, profileErr.message);

    return {
      accessToken: data.session!.access_token,
      refreshToken: data.session!.refresh_token,
      user: profile,
    };
  }

  async refreshToken(refreshToken: string) {
    const { data, error } = await supabaseAdmin.auth.refreshSession({ refresh_token: refreshToken });
    if (error) throw new UnauthorizedError("Invalid refresh token");

    return {
      accessToken: data.session!.access_token,
      refreshToken: data.session!.refresh_token,
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
