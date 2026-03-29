import { Link, useLocation, useNavigate } from "react-router";
import {
  LayoutDashboard,
  Zap,
  Briefcase,
  Wand2,
  ListChecks,
  BarChart3,
  Settings,
  Sparkles,
  LogOut,
  Shield,
  ScrollText,
} from "lucide-react";
import { Badge } from "../ui/badge";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Progress } from "../ui/progress";
import { Button } from "../ui/button";
import { useAuth } from "../../contexts/AuthContext";

const navigation = [
  { name: "Dashboard",    href: "/",            icon: LayoutDashboard },
  { name: "Job Agent",    href: "/agent",        icon: Zap             },
  { name: "Job Board",    href: "/jobs",         icon: Briefcase       },
  { name: "Master Resume", href: "/resume",      icon: Wand2           },
  { name: "Applications", href: "/applications", icon: ListChecks      },
  { name: "Analytics",    href: "/analytics",    icon: BarChart3       },
  { name: "Settings",     href: "/settings",     icon: Settings        },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const allNav = [
    ...navigation,
    ...(user?.isAdmin
      ? [
          { name: "Admin", href: "/admin/users", icon: Shield },
          { name: "Platform Logs", href: "/admin/logs", icon: ScrollText },
        ]
      : []),
  ];

  const handleLogout = () => {
    logout();
    navigate("/auth/login", { replace: true });
  };

  const initials = user
    ? `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase()
    : "?";

  const creditPct = user
    ? Math.round((user.aiCredits / user.totalCredits) * 100)
    : 0;

  const planLabel =
    user?.plan === "pro"
      ? "Pro Plan"
      : user?.plan === "agency"
      ? "Agency Plan"
      : "Free Plan";

  return (
    <div className="flex h-screen w-64 flex-col bg-[#0D1117] border-r border-[#1F2937]">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-6 border-b border-[#1F2937]">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4F8CFF]">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div className="flex flex-col">
          <span className="text-[15px] font-semibold text-white">JobFlow AI</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {allNav.map((item) => {
          const isActive =
            item.href === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              to={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] transition-all ${
                isActive
                  ? "bg-[#4F8CFF]/10 text-[#4F8CFF] font-medium"
                  : "text-[#9CA3AF] hover:bg-[#1F2937] hover:text-white"
              }`}
            >
              <Icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* AI Credits */}
      <div className="mx-3 mb-4 rounded-lg bg-[#111827] p-4 border border-[#1F2937]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] text-[#9CA3AF]">AI Credits</span>
          <span className="text-[13px] font-semibold text-white">
            {user?.aiCredits ?? 0} / {user?.totalCredits ?? 0}
          </span>
        </div>
        <Progress value={creditPct} className="h-1.5 mb-3" />
        <Badge
          variant="secondary"
          className="text-[11px] bg-[#4F8CFF]/10 text-[#4F8CFF] border-[#4F8CFF]/20"
        >
          {planLabel}
        </Badge>
      </div>

      {/* User Profile + Logout */}
      <div className="border-t border-[#1F2937] px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarFallback className="bg-[#4F8CFF] text-white text-[13px]">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-white truncate">
              {user ? `${user.firstName} ${user.lastName}` : ""}
            </p>
            <p className="text-[11px] text-[#9CA3AF] truncate">
              {user?.location ?? user?.email ?? ""}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-[#9CA3AF] hover:text-[#EF4444] hover:bg-[#EF4444]/10 p-1.5 h-auto"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
