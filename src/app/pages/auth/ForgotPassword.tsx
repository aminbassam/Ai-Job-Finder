import { useState } from "react";
import { Link } from "react-router";
import { Sparkles, AlertCircle, MailCheck, ArrowLeft } from "lucide-react";
import { useForm } from "react-hook-form";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import { authService } from "../../services/auth.service";

interface ForgotFormValues {
  email: string;
}

export function ForgotPassword() {
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotFormValues>();

  const onSubmit = async (data: ForgotFormValues) => {
    setServerError("");
    setIsLoading(true);
    try {
      await authService.forgotPassword({ email: data.email });
      setSubmittedEmail(data.email);
      setSent(true);
    } catch (err) {
      setServerError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

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
          {sent ? (
            /* Success state */
            <div className="text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#22C55E]/10 border border-[#22C55E]/30 mx-auto mb-5">
                <MailCheck className="h-8 w-8 text-[#22C55E]" />
              </div>
              <h1 className="text-[24px] font-semibold text-white mb-2">
                Check your email
              </h1>
              <p className="text-[14px] text-[#9CA3AF] mb-2">
                We sent a password reset link to
              </p>
              <p className="text-[14px] font-medium text-white mb-6">
                {submittedEmail}
              </p>
              <p className="text-[13px] text-[#9CA3AF] mb-6">
                Didn&apos;t receive the email? Check your spam folder, or{" "}
                <button
                  onClick={() => setSent(false)}
                  className="text-[#4F8CFF] hover:text-[#4F8CFF]/80 transition-colors"
                >
                  try again
                </button>
                .
              </p>
              <Link
                to="/auth/login"
                className="inline-flex items-center gap-2 text-[13px] text-[#9CA3AF] hover:text-white transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to sign in
              </Link>
            </div>
          ) : (
            /* Request form */
            <>
              <div className="mb-6">
                <Link
                  to="/auth/login"
                  className="inline-flex items-center gap-1.5 text-[13px] text-[#9CA3AF] hover:text-white transition-colors mb-6"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to sign in
                </Link>
                <h1 className="text-[28px] font-semibold text-white mb-2">
                  Forgot password?
                </h1>
                <p className="text-[14px] text-[#9CA3AF]">
                  Enter your email and we&apos;ll send you a reset link.
                </p>
              </div>

              {serverError && (
                <div className="flex items-center gap-2 mb-5 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/30 p-3">
                  <AlertCircle className="h-4 w-4 text-[#EF4444] shrink-0" />
                  <p className="text-[13px] text-[#EF4444]">{serverError}</p>
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
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

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-[#4F8CFF] hover:bg-[#4F8CFF]/90 text-white h-11 disabled:opacity-60"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      Sending reset link…
                    </span>
                  ) : (
                    "Send Reset Link"
                  )}
                </Button>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
