import { useEffect, useState, useCallback } from "react";
import {
  Users, Search, Shield, ShieldOff, Trash2, Edit2, ChevronLeft,
  ChevronRight, CheckCircle2, XCircle, Crown, UserCheck, UserX, RefreshCw,
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Label } from "../../components/ui/label";
import { api } from "../../services/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  isAdmin: boolean;
  emailVerified: boolean;
  lastLogin: string | null;
  createdAt: string;
  location: string | null;
  plan: "free" | "pro" | "agency";
  aiCredits: number;
}

interface Stats {
  total: number;
  active: number;
  verified: number;
  admins: number;
  byPlan: { free: number; pro: number; agency: number };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function PlanBadge({ plan }: { plan: string }) {
  const styles: Record<string, string> = {
    agency: "bg-[#A78BFA]/10 text-[#A78BFA] border-[#A78BFA]/20",
    pro:    "bg-[#4F8CFF]/10 text-[#4F8CFF] border-[#4F8CFF]/20",
    free:   "bg-[#1F2937] text-[#9CA3AF] border-[#374151]",
  };
  return (
    <Badge variant="outline" className={`text-[11px] capitalize ${styles[plan] ?? styles.free}`}>
      {plan === "agency" && <Crown className="h-3 w-3 mr-1" />}
      {plan}
    </Badge>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <Badge variant="outline" className="text-[11px] bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/20">
      <CheckCircle2 className="h-3 w-3 mr-1" /> Active
    </Badge>
  ) : (
    <Badge variant="outline" className="text-[11px] bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20">
      <XCircle className="h-3 w-3 mr-1" /> Inactive
    </Badge>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  return (
    <div className="h-9 w-9 rounded-full bg-[#4F8CFF]/20 flex items-center justify-center shrink-0">
      <span className="text-[12px] font-semibold text-[#4F8CFF]">{initials}</span>
    </div>
  );
}

function fmt(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

interface EditModalProps {
  user: AdminUser;
  onClose: () => void;
  onSaved: () => void;
}

function EditModal({ user, onClose, onSaved }: EditModalProps) {
  const [form, setForm] = useState({
    firstName: user.firstName,
    lastName:  user.lastName,
    email:     user.email,
    plan:      user.plan,
    isAdmin:   user.isAdmin,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await api.patch(`/admin/users/${user.id}`, {
        firstName: form.firstName,
        lastName:  form.lastName,
        email:     form.email,
        plan:      form.plan,
        isAdmin:   form.isAdmin,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#111827] border border-[#1F2937] rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1F2937]">
          <h2 className="text-[16px] font-semibold text-white">Edit User</h2>
          <button onClick={onClose} className="text-[#9CA3AF] hover:text-white transition-colors text-lg leading-none">✕</button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/30 px-3 py-2 text-[13px] text-[#EF4444]">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px] text-[#9CA3AF] mb-1.5 block">First Name</Label>
              <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                className="bg-[#0B0F14] border-[#1F2937] text-white h-9 text-[13px]" />
            </div>
            <div>
              <Label className="text-[12px] text-[#9CA3AF] mb-1.5 block">Last Name</Label>
              <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                className="bg-[#0B0F14] border-[#1F2937] text-white h-9 text-[13px]" />
            </div>
          </div>

          <div>
            <Label className="text-[12px] text-[#9CA3AF] mb-1.5 block">Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="bg-[#0B0F14] border-[#1F2937] text-white h-9 text-[13px]" />
          </div>

          <div>
            <Label className="text-[12px] text-[#9CA3AF] mb-1.5 block">Subscription Plan</Label>
            <select
              value={form.plan}
              onChange={(e) => setForm({ ...form, plan: e.target.value as "free" | "pro" | "agency" })}
              className="w-full h-9 rounded-md border border-[#1F2937] bg-[#0B0F14] text-white text-[13px] px-3 outline-none focus:border-[#4F8CFF]"
            >
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="agency">Agency</option>
            </select>
          </div>

          <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-[#0B0F14] border border-[#1F2937]">
            <div>
              <p className="text-[13px] text-white font-medium">Admin privileges</p>
              <p className="text-[11px] text-[#9CA3AF]">Full access to admin dashboard</p>
            </div>
            <button
              type="button"
              onClick={() => setForm({ ...form, isAdmin: !form.isAdmin })}
              className={`w-11 h-6 rounded-full transition-colors relative ${form.isAdmin ? "bg-[#4F8CFF]" : "bg-[#374151]"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform shadow ${form.isAdmin ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-[#1F2937]">
          <Button variant="outline" onClick={onClose} className="flex-1 border-[#1F2937] text-[#9CA3AF] hover:text-white bg-transparent h-9 text-[13px]">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1 bg-[#4F8CFF] hover:bg-[#4F8CFF]/90 text-white h-9 text-[13px]">
            {saving ? <><span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Saving…</> : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────

interface DeleteModalProps {
  user: AdminUser;
  onClose: () => void;
  onDeleted: () => void;
}

function DeleteModal({ user, onClose, onDeleted }: DeleteModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError]       = useState("");

  async function handleDelete() {
    setDeleting(true);
    setError("");
    try {
      await api.delete(`/admin/users/${user.id}`);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete.");
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#111827] border border-[#1F2937] rounded-xl w-full max-w-sm shadow-2xl">
        <div className="p-6 text-center">
          <div className="h-12 w-12 rounded-full bg-[#EF4444]/10 flex items-center justify-center mx-auto mb-4">
            <Trash2 className="h-6 w-6 text-[#EF4444]" />
          </div>
          <h2 className="text-[16px] font-semibold text-white mb-2">Delete User</h2>
          <p className="text-[13px] text-[#9CA3AF] mb-1">
            Are you sure you want to delete <span className="text-white font-medium">{user.firstName} {user.lastName}</span>?
          </p>
          <p className="text-[12px] text-[#EF4444]">This action cannot be undone. All their data will be permanently removed.</p>
          {error && <p className="text-[12px] text-[#EF4444] mt-3">{error}</p>}
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <Button variant="outline" onClick={onClose} className="flex-1 border-[#1F2937] text-[#9CA3AF] hover:text-white bg-transparent h-9 text-[13px]">
            Cancel
          </Button>
          <Button onClick={handleDelete} disabled={deleting}
            className="flex-1 bg-[#EF4444] hover:bg-[#EF4444]/90 text-white h-9 text-[13px]">
            {deleting ? <><span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Deleting…</> : "Delete"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function AdminUsers() {
  const [users, setUsers]         = useState<AdminUser[]>([]);
  const [stats, setStats]         = useState<Stats | null>(null);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, pages: 1 });
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch]       = useState("");
  const [filterPlan, setFilterPlan]       = useState("");
  const [filterStatus, setFilterStatus]   = useState("");
  const [filterVerified, setFilterVerified] = useState("");
  const [editUser, setEditUser]   = useState<AdminUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const data = await api.get<Stats>("/admin/stats");
      setStats(data);
    } catch { /* ignore */ }
  }, []);

  const loadUsers = useCallback(async (page = 1) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (search)         params.set("search",   search);
      if (filterPlan)     params.set("plan",     filterPlan);
      if (filterStatus)   params.set("status",   filterStatus);
      if (filterVerified) params.set("verified", filterVerified);

      const data = await api.get<{ users: AdminUser[]; pagination: Pagination }>(
        `/admin/users?${params.toString()}`
      );
      setUsers(data.users);
      setPagination(data.pagination);
    } catch { /* ignore */ } finally {
      setIsLoading(false);
    }
  }, [search, filterPlan, filterStatus, filterVerified]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadUsers(1); }, [loadUsers]);

  async function toggleStatus(user: AdminUser) {
    setTogglingId(user.id);
    try {
      const res = await api.patch<{ isActive: boolean }>(`/admin/users/${user.id}/status`, {});
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, isActive: res.isActive } : u));
      loadStats();
    } catch { /* ignore */ } finally {
      setTogglingId(null);
    }
  }

  function handleSaved() {
    setEditUser(null);
    loadUsers(pagination.page);
    loadStats();
  }

  function handleDeleted() {
    setDeleteUser(null);
    loadUsers(1);
    loadStats();
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="h-5 w-5 text-[#4F8CFF]" />
            <h1 className="text-[28px] font-semibold text-white">User Management</h1>
          </div>
          <p className="text-[14px] text-[#9CA3AF]">Manage all platform users and their permissions</p>
        </div>
        <Button onClick={() => { loadUsers(pagination.page); loadStats(); }}
          variant="outline" className="border-[#1F2937] text-[#9CA3AF] hover:text-white bg-transparent gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
          {[
            { label: "Total Users",  value: stats.total,           icon: Users,      color: "text-white" },
            { label: "Active",       value: stats.active,          icon: UserCheck,  color: "text-[#22C55E]" },
            { label: "Verified",     value: stats.verified,        icon: CheckCircle2, color: "text-[#4F8CFF]" },
            { label: "Admins",       value: stats.admins,          icon: Shield,     color: "text-[#A78BFA]" },
            { label: "Free",         value: stats.byPlan.free,     icon: null,       color: "text-[#9CA3AF]" },
            { label: "Pro",          value: stats.byPlan.pro,      icon: null,       color: "text-[#4F8CFF]" },
            { label: "Agency",       value: stats.byPlan.agency,   icon: Crown,      color: "text-[#A78BFA]" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="bg-[#111827] border-[#1F2937] p-4">
              <div className="flex items-center gap-2 mb-1">
                {Icon && <Icon className={`h-4 w-4 ${color}`} />}
                <span className="text-[12px] text-[#9CA3AF]">{label}</span>
              </div>
              <p className={`text-[24px] font-bold ${color}`}>{value}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <Card className="bg-[#111827] border-[#1F2937] p-4 mb-6">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="pl-9 bg-[#0B0F14] border-[#1F2937] text-white placeholder:text-[#9CA3AF] h-9 text-[13px]"
            />
          </div>
          {[
            { label: "Plan",     value: filterPlan,     set: setFilterPlan,     opts: [["", "All Plans"], ["free", "Free"], ["pro", "Pro"], ["agency", "Agency"]] },
            { label: "Status",   value: filterStatus,   set: setFilterStatus,   opts: [["", "All Status"], ["active", "Active"], ["inactive", "Inactive"]] },
            { label: "Verified", value: filterVerified, set: setFilterVerified, opts: [["", "All"], ["yes", "Verified"], ["no", "Unverified"]] },
          ].map(({ label, value, set, opts }) => (
            <select key={label} value={value} onChange={(e) => set(e.target.value)}
              className="h-9 rounded-md border border-[#1F2937] bg-[#0B0F14] text-[#9CA3AF] text-[13px] px-3 outline-none focus:border-[#4F8CFF] min-w-[130px]">
              {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ))}
        </div>
      </Card>

      {/* Table */}
      <Card className="bg-[#111827] border-[#1F2937] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#1F2937]">
                {["User", "Plan", "Status", "Verified", "Joined", "Last Login", "Actions"].map((h) => (
                  <th key={h} className="text-left text-[12px] font-medium text-[#9CA3AF] px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-[#9CA3AF] text-[14px]">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 border-2 border-[#4F8CFF]/30 border-t-[#4F8CFF] rounded-full animate-spin" />
                      Loading users…
                    </span>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-[#9CA3AF] text-[14px]">No users found.</td>
                </tr>
              ) : users.map((user) => (
                <tr key={user.id} className="border-b border-[#1F2937]/50 hover:bg-[#1F2937]/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={`${user.firstName} ${user.lastName}`} />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-[13px] font-medium text-white">
                            {user.firstName} {user.lastName}
                          </p>
                          {user.isAdmin && (
                            <Shield className="h-3.5 w-3.5 text-[#A78BFA]" title="Admin" />
                          )}
                        </div>
                        <p className="text-[12px] text-[#9CA3AF]">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><PlanBadge plan={user.plan} /></td>
                  <td className="px-4 py-3"><StatusBadge isActive={user.isActive} /></td>
                  <td className="px-4 py-3">
                    {user.emailVerified
                      ? <CheckCircle2 className="h-4 w-4 text-[#22C55E]" />
                      : <XCircle className="h-4 w-4 text-[#9CA3AF]" />}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-[#9CA3AF]">{fmt(user.createdAt)}</td>
                  <td className="px-4 py-3 text-[12px] text-[#9CA3AF]">{fmt(user.lastLogin)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {/* Edit */}
                      <button onClick={() => setEditUser(user)}
                        className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#4F8CFF] hover:bg-[#4F8CFF]/10 transition-colors" title="Edit">
                        <Edit2 className="h-4 w-4" />
                      </button>
                      {/* Toggle active */}
                      <button onClick={() => toggleStatus(user)} disabled={togglingId === user.id}
                        className={`p-1.5 rounded-lg transition-colors ${user.isActive
                          ? "text-[#9CA3AF] hover:text-[#EF4444] hover:bg-[#EF4444]/10"
                          : "text-[#9CA3AF] hover:text-[#22C55E] hover:bg-[#22C55E]/10"}`}
                        title={user.isActive ? "Deactivate" : "Activate"}>
                        {togglingId === user.id
                          ? <span className="h-4 w-4 border-2 border-current/30 border-t-current rounded-full animate-spin block" />
                          : user.isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                      </button>
                      {/* Admin toggle */}
                      <button
                        onClick={() => api.patch(`/admin/users/${user.id}`, { isAdmin: !user.isAdmin }).then(() => loadUsers(pagination.page))}
                        className={`p-1.5 rounded-lg transition-colors ${user.isAdmin
                          ? "text-[#A78BFA] hover:bg-[#A78BFA]/10"
                          : "text-[#9CA3AF] hover:text-[#A78BFA] hover:bg-[#A78BFA]/10"}`}
                        title={user.isAdmin ? "Remove admin" : "Make admin"}>
                        {user.isAdmin ? <Shield className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
                      </button>
                      {/* Delete */}
                      <button onClick={() => setDeleteUser(user)}
                        className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors" title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#1F2937]">
            <p className="text-[12px] text-[#9CA3AF]">
              Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} users
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={pagination.page <= 1}
                onClick={() => loadUsers(pagination.page - 1)}
                className="border-[#1F2937] text-[#9CA3AF] hover:text-white bg-transparent h-8 w-8 p-0">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-[12px] text-[#9CA3AF]">Page {pagination.page} of {pagination.pages}</span>
              <Button variant="outline" size="sm" disabled={pagination.page >= pagination.pages}
                onClick={() => loadUsers(pagination.page + 1)}
                className="border-[#1F2937] text-[#9CA3AF] hover:text-white bg-transparent h-8 w-8 p-0">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Modals */}
      {editUser   && <EditModal   user={editUser}   onClose={() => setEditUser(null)}   onSaved={handleSaved} />}
      {deleteUser && <DeleteModal user={deleteUser} onClose={() => setDeleteUser(null)} onDeleted={handleDeleted} />}
    </div>
  );
}
