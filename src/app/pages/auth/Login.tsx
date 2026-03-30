import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router";
import { Sparkles, Eye, EyeOff, AlertCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import { POST_LOGOUT_REDIRECT_KEY, useAuth } from "../../contexts/AuthContext";

interface LoginFormValues {
  identifier: string;
  password: string;
}

export function Login() {
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const signedOutIntentionally = sessionStorage.getItem(POST_LOGOUT_REDIRECT_KEY) === "1";
  const from = signedOutIntentionally
    ? "/"
    : (location.state as { from?: string } | null)?.from ?? "/";

  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormValues>();

  const onSubmit = async (data: LoginFormValues) => {
    setServerError("");
    try {
      await login(data.identifier, data.password);
      sessionStorage.removeItem(POST_LOGOUT_REDIRECT_KEY);
      navigate(from, { replace: true });
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : "Invalid email, username, or password."
      );
    }
  };

  function fillDemoCredentials() {
    setValue("identifier", "demo");
    setValue("password", "Demo@123456");
    setServerError("");
  }

  return (
    <div className="min-h-screen bg-[#0B0F14] flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#4F8CFF]">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <span className="text-[24px] font-semibold text-white">JobFlow AI</span>
        </div>

        <Card className="bg-[#111827] border-[#1F2937] p-8">
          <div className="mb-6 text-center">
            <h1 className="text-[28px] font-semibold text-white mb-2">Welcome back</h1>
            <p className="text-[14px] text-[#9CA3AF]">
              Sign in to your account to continue
            </p>
          </div>

          {serverError && (
            <div className="flex items-center gap-2 mb-5 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/30 p-3">
              <AlertCircle className="h-4 w-4 text-[#EF4444] shrink-0" />
              <p className="text-[13px] text-[#EF4444]">{serverError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            {/* Email or username */}
            <div>
              <Label className="text-[13px] text-[#9CA3AF] mb-2 block">
                Email or username
              </Label>
              <Input
                type="text"
                placeholder="john@example.com or john_doe"
                autoComplete="username"
                className={`bg-[#0B0F14] border-[#1F2937] text-white placeholder:text-[#9CA3AF] h-11 ${
                  errors.identifier ? "border-[#EF4444]" : ""
                }`}
                {...register("identifier", {
                  required: "Email or username is required.",
                  validate: (value) => value.trim().length > 0 || "Email or username is required.",
                })}
              />
              {errors.identifier && (
                <p className="text-[11px] text-[#EF4444] mt-1">
                  {errors.identifier.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-[13px] text-[#9CA3AF]">Password</Label>
                <Link
                  to="/auth/forgot-password"
                  className="text-[12px] text-[#4F8CFF] hover:text-[#4F8CFF]/80 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={`bg-[#0B0F14] border-[#1F2937] text-white placeholder:text-[#9CA3AF] h-11 pr-10 ${
                    errors.password ? "border-[#EF4444]" : ""
                  }`}
                  {...register("password", {
                    required: "Password is required.",
                    minLength: {
                      value: 8,
                      message: "Password must be at least 8 characters.",
                    },
                  })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-white transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-[11px] text-[#EF4444] mt-1">
                  {errors.password.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#4F8CFF] hover:bg-[#4F8CFF]/90 text-white h-11 disabled:opacity-60"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Signing in…
                </span>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-[13px] text-[#9CA3AF]">
              Don&apos;t have an account?{" "}
              <Link
                to="/auth/signup"
                className="text-[#4F8CFF] hover:text-[#4F8CFF]/80 transition-colors"
              >
                Sign up
              </Link>
            </p>
          </div>

          <div className="mt-6 rounded-xl border border-[#4F8CFF]/20 bg-[#4F8CFF]/10 p-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#93C5FD]">
              Client Demo Access
            </p>
            <p className="mt-2 text-[13px] text-[#DBEAFE]">
              Use this account to preview the dashboard and sample workflow without signing up.
            </p>
            <div className="mt-3 space-y-1 text-[13px] text-white">
              <p>
                Username: <span className="font-semibold">demo</span>
              </p>
              <p>
                Password: <span className="font-semibold">Demo@123456</span>
              </p>
            </div>
            <p className="mt-3 text-[12px] text-[#BFDBFE]">
              Demo activity resets every 24 hours.
            </p>
            <Button
              type="button"
              onClick={fillDemoCredentials}
              variant="outline"
              className="mt-4 w-full border-[#93C5FD]/30 bg-[#0B0F14]/40 text-white hover:bg-[#1D4ED8]/20"
            >
              Use Demo Credentials
            </Button>
          </div>
        </Card>

        <p className="text-center text-[12px] text-[#9CA3AF] mt-6">
          By signing in, you agree to our{" "}
          <a href="#" className="text-[#4F8CFF] hover:text-[#4F8CFF]/80">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="#" className="text-[#4F8CFF] hover:text-[#4F8CFF]/80">
            Privacy Policy
          </a>
        </p>
      </div>
    </div>
  );
}
