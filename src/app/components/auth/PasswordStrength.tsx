interface Strength {
  score: number;
  label: string;
  color: string;
}

function getStrength(password: string): Strength {
  if (!password) return { score: 0, label: "", color: "" };

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score: 1, label: "Weak", color: "#EF4444" };
  if (score <= 2) return { score: 2, label: "Fair", color: "#F59E0B" };
  if (score <= 3) return { score: 3, label: "Good", color: "#3B82F6" };
  return { score: 4, label: "Strong", color: "#22C55E" };
}

interface PasswordStrengthProps {
  password: string;
}

export function PasswordStrength({ password }: PasswordStrengthProps) {
  const { score, label, color } = getStrength(password);

  if (!password) return null;

  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{ backgroundColor: i <= score ? color : "#1F2937" }}
          />
        ))}
      </div>
      <p className="text-[11px] transition-colors" style={{ color }}>
        {label} password
      </p>
    </div>
  );
}
