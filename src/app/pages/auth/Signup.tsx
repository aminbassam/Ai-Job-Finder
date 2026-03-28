import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Sparkles, Eye, EyeOff, AlertCircle, CheckCircle2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import { PasswordStrength } from "../../components/auth/PasswordStrength";
import { useAuth } from "../../contexts/AuthContext";

interface SignupFormValues {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export function Signup() {
  const { signup, isLoading } = useAuth();
  const navigate = useNavigate();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [serverError, setServerError] = useState("");

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SignupFormValues>();

  const passwordValue = watch("password", "");

  const onSubmit = async (data: SignupFormValues) => {
    setServerError("");
    try {
      await signup({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        password: data.password,
      });
      navigate("/", { replace: true });
    } catch (err) {
      setServerError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    }
  };

  const benefits = [
    "AI-powered job matching",
    "Tailored resume generation",
    "Application pipeline tracking",
  ];

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

        {/* Benefits strip */}
        <div className="flex justify-center gap-6 mb-6">
          {benefits.map((b) => (
            <div key={b} className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#22C55E] shrink-0" />
              <span className="text-[11px] text-[#9CA3AF]">{b}</span>
            </div>
          ))}
        </div>

        <Card className="bg-[#111827] border-[#1F2937] p-8">
          <div className="mb-6 text-center">
            <h1 className="text-[28px] font-semibold text-white mb-2">
              Create your account
            </h1>
            <p className="text-[14px] text-[#9CA3AF]">
              Start your AI-powered job search today
            </p>
          </div>

          {serverError && (
            <div className="flex items-center gap-2 mb-5 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/30 p-3">
              <AlertCircle className="h-4 w-4 text-[#EF4444] shrink-0" />
              <p className="text-[13px] text-[#EF4444]">{serverError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            {/* Name row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[13px] text-[#9CA3AF] mb-2 block">
                  First Name
                </Label>
                <Input
                  type="text"
                  placeholder="John"
                  autoComplete="given-name"
                  className={`bg-[#0B0F14] border-[#1F2937] text-white placeholder:text-[#9CA3AF] h-11 ${
                    errors.firstName ? "border-[#EF4444]" : ""
                  }`}
                  {...register("firstName", {
                    required: "Required.",
                    minLength: { value: 2, message: "Too short." },
                  })}
                />
                {errors.firstName && (
                  <p className="text-[11px] text-[#EF4444] mt-1">
                    {errors.firstName.message}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-[13px] text-[#9CA3AF] mb-2 block">
                  Last Name
                </Label>
                <Input
                  type="text"
                  placeholder="Doe"
                  autoComplete="family-name"
                  className={`bg-[#0B0F14] border-[#1F2937] text-white placeholder:text-[#9CA3AF] h-11 ${
                    errors.lastName ? "border-[#EF4444]" : ""
                  }`}
                  {...register("lastName", {
                    required: "Required.",
                    minLength: { value: 2, message: "Too short." },
                  })}
                />
                {errors.lastName && (
                  <p className="text-[11px] text-[#EF4444] mt-1">
                    {errors.lastName.message}
                  </p>
                )}
              </div>
            </div>

            {/* Email */}
            <div>
              <Label className="text-[13px] text-[#9CA3AF] mb-2 block">
                Email
              </Label>
              <Input
                type="email"
                placeholder="john@example.com"
                autoComplete="email"
                className={`bg-[#0B0F14] border-[#1F2937] text-white placeholder:text-[#9CA3AF] h-11 ${
                  errors.email ? "border-[#EF4444]" : ""
                }`}
                {...register("email", {
                  required: "Email is required.",
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: "Enter a valid email address.",
                  },
                })}
              />
              {errors.email && (
                <p className="text-[11px] text-[#EF4444] mt-1">
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <Label className="text-[13px] text-[#9CA3AF] mb-2 block">
                Password
              </Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className={`bg-[#0B0F14] border-[#1F2937] text-white placeholder:text-[#9CA3AF] h-11 pr-10 ${
                    errors.password ? "border-[#EF4444]" : ""
                  }`}
                  {...register("password", {
                    required: "Password is required.",
                    minLength: {
                      value: 8,
                      message: "Must be at least 8 characters.",
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
              <PasswordStrength password={passwordValue} />
            </div>

            {/* Confirm password */}
            <div>
              <Label className="text-[13px] text-[#9CA3AF] mb-2 block">
                Confirm Password
              </Label>
              <div className="relative">
                <Input
                  type={showConfirm ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className={`bg-[#0B0F14] border-[#1F2937] text-white placeholder:text-[#9CA3AF] h-11 pr-10 ${
                    errors.confirmPassword ? "border-[#EF4444]" : ""
                  }`}
                  {...register("confirmPassword", {
                    required: "Please confirm your password.",
                    validate: (val) =>
                      val === passwordValue || "Passwords do not match.",
                  })}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-white transition-colors"
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                >
                  {showConfirm ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-[11px] text-[#EF4444] mt-1">
                  {errors.confirmPassword.message}
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
                  Creating account…
                </span>
              ) : (
                "Create Account"
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-[13px] text-[#9CA3AF]">
              Already have an account?{" "}
              <Link
                to="/auth/login"
                className="text-[#4F8CFF] hover:text-[#4F8CFF]/80 transition-colors"
              >
                Sign in
              </Link>
            </p>
          </div>
        </Card>

        <p className="text-center text-[12px] text-[#9CA3AF] mt-6">
          By signing up, you agree to our{" "}
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
