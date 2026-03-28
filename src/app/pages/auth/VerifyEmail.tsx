import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";
import { Sparkles, Mail, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { useAuth } from "../../contexts/AuthContext";
import { authService } from "../../services/auth.service";

const CODE_LENGTH = 6;

export function VerifyEmail() {
  const { user, updateUser, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/auth/login", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Redirect already-verified users to dashboard
  useEffect(() => {
    if (isAuthenticated && user?.emailVerified) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, user?.emailVerified, navigate]);

  // Cooldown timer for resend button
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  function focusIndex(index: number) {
    inputRefs.current[index]?.focus();
  }

  function handleChange(index: number, value: string) {
    // Accept only digits
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    setError("");

    if (digit && index < CODE_LENGTH - 1) {
      focusIndex(index + 1);
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[index]) {
        const next = [...digits];
        next[index] = "";
        setDigits(next);
      } else if (index > 0) {
        focusIndex(index - 1);
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      focusIndex(index - 1);
    } else if (e.key === "ArrowRight" && index < CODE_LENGTH - 1) {
      focusIndex(index + 1);
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;

    const next = [...digits];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    setDigits(next);
    setError("");
    focusIndex(Math.min(pasted.length, CODE_LENGTH - 1));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = digits.join("");
    if (code.length < CODE_LENGTH) {
      setError("Please enter all 6 digits.");
      return;
    }

    setIsVerifying(true);
    setError("");

    try {
      const { user: updatedUser } = await authService.verifyEmail(code);
      updateUser({ emailVerified: updatedUser.emailVerified });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code. Please try again.");
      // Clear digits on error so user can re-enter
      setDigits(Array(CODE_LENGTH).fill(""));
      focusIndex(0);
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || isResending) return;

    setIsResending(true);
    setResendSuccess(false);
    setError("");

    try {
      await authService.sendVerification();
      setResendSuccess(true);
      setResendCooldown(60);
      setDigits(Array(CODE_LENGTH).fill(""));
      focusIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend code. Please try again.");
    } finally {
      setIsResending(false);
    }
  }

  const code = digits.join("");
  const isComplete = code.length === CODE_LENGTH;

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
          {/* Header */}
          <div className="flex flex-col items-center mb-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#4F8CFF]/10 border border-[#4F8CFF]/30 mb-4">
              <Mail className="h-6 w-6 text-[#4F8CFF]" />
            </div>
            <h1 className="text-[24px] font-semibold text-white mb-2">Check your email</h1>
            <p className="text-[14px] text-[#9CA3AF]">
              We sent a 6-digit verification code to
            </p>
            {user?.email && (
              <p className="text-[14px] font-medium text-white mt-1">{user.email}</p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 mb-5 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/30 p-3">
              <AlertCircle className="h-4 w-4 text-[#EF4444] shrink-0" />
              <p className="text-[13px] text-[#EF4444]">{error}</p>
            </div>
          )}

          {/* Resend success */}
          {resendSuccess && !error && (
            <div className="flex items-center gap-2 mb-5 rounded-lg bg-[#22C55E]/10 border border-[#22C55E]/30 p-3">
              <CheckCircle2 className="h-4 w-4 text-[#22C55E] shrink-0" />
              <p className="text-[13px] text-[#22C55E]">New code sent — check your inbox.</p>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* OTP inputs */}
            <div className="flex justify-center gap-3 mb-6">
              {digits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  onPaste={handlePaste}
                  onFocus={(e) => e.target.select()}
                  autoFocus={i === 0}
                  className={[
                    "w-12 h-14 rounded-lg border text-center text-[22px] font-semibold text-white bg-[#0B0F14] outline-none transition-all",
                    "focus:border-[#4F8CFF] focus:ring-2 focus:ring-[#4F8CFF]/20",
                    digit ? "border-[#4F8CFF]/60" : "border-[#1F2937]",
                    error ? "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]/20" : "",
                  ].join(" ")}
                />
              ))}
            </div>

            <Button
              type="submit"
              disabled={!isComplete || isVerifying}
              className="w-full bg-[#4F8CFF] hover:bg-[#4F8CFF]/90 text-white h-11 disabled:opacity-60"
            >
              {isVerifying ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Verifying…
                </span>
              ) : (
                "Verify Email"
              )}
            </Button>
          </form>

          {/* Resend */}
          <div className="mt-5 text-center">
            <p className="text-[13px] text-[#9CA3AF]">
              Didn&apos;t receive the email?{" "}
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0 || isResending}
                className="text-[#4F8CFF] hover:text-[#4F8CFF]/80 transition-colors disabled:text-[#4F8CFF]/40 disabled:cursor-not-allowed inline-flex items-center gap-1"
              >
                {isResending ? (
                  <>
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    Sending…
                  </>
                ) : resendCooldown > 0 ? (
                  `Resend in ${resendCooldown}s`
                ) : (
                  "Resend code"
                )}
              </button>
            </p>
          </div>
        </Card>

        <p className="text-center text-[12px] text-[#9CA3AF] mt-6">
          Wrong email?{" "}
          <a
            href="/auth/signup"
            className="text-[#4F8CFF] hover:text-[#4F8CFF]/80"
            onClick={(e) => { e.preventDefault(); navigate("/auth/signup"); }}
          >
            Create a new account
          </a>
        </p>
      </div>
    </div>
  );
}
