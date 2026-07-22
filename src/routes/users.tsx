import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ASSIGNABLE_ROLES, canManageUsers, type AppRole } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/users")({
  component: UsersPage,
  head: () => ({
    meta: [
      { title: "Manage Users · Fire Alarm Dashboard" },
      { name: "description", content: "Admin-only view for assigning roles to team members." },
    ],
  }),
});

interface Row { id: string; user_id: string; role: AppRole; created_at: string }

function UsersPage() {
  const navigate = useNavigate();
  const { user, role, loading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/auth", replace: true }); return; }
    if (!canManageUsers(role)) { navigate({ to: "/", replace: true }); }
  }, [user, role, loading, navigate]);

  const load = useCallback(async () => {
    setBusy(true);
    const { data, error } = await supabase
      .from("user_roles")
      .select("id, user_id, role, created_at")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setRows((data ?? []) as Row[]);
    setBusy(false);
  }, []);

  useEffect(() => { if (canManageUsers(role)) void load(); }, [role, load]);

  async function updateRole(row: Row, newRole: AppRole) {
    if (newRole === row.role) return;
    const { error } = await supabase.from("user_roles").update({ role: newRole }).eq("id", row.id);
    if (error) toast.error(error.message);
    else { toast.success("Role updated"); void load(); }
  }

  async function removeRole(row: Row) {
    if (row.user_id === user?.id) { toast.error("You cannot remove your own admin role."); return; }
    if (!confirm("Remove this role assignment?")) return;
    const { error } = await supabase.from("user_roles").delete().eq("id", row.id);
    if (error) toast.error(error.message);
    else { toast.success("Removed"); void load(); }
  }

  if (loading || !canManageUsers(role)) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-30">
        <div className="max-w-[1200px] mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/" })}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
            <h1 className="font-semibold">Manage Users</h1>
          </div>
          <Badge variant="secondary">Admin</Badge>
        </div>
      </header>
      <main className="max-w-[1200px] mx-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Role Assignments</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User ID</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    {busy ? "Loading…" : "No role assignments yet."}
                  </TableCell></TableRow>
                )}
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">
                      {r.user_id}{r.user_id === user?.id && <Badge variant="outline" className="ml-2">you</Badge>}
                    </TableCell>
                    <TableCell>
                      <Select value={r.role} onValueChange={(v) => updateRole(r, v as AppRole)}>
                        <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ASSIGNABLE_ROLES.map((rl) => (
                            <SelectItem key={rl} value={rl}>{rl}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{format(new Date(r.created_at), "yyyy-MM-dd HH:mm")}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => removeRole(r)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground mt-3">
          Roles: <strong>admin</strong> (full access + user management), <strong>manager / engineer / supervisor / operator</strong>
          {" "}(view, open, edit, close tickets), <strong>viewer</strong> (read-only). Only admins can delete tickets or manage users.
          New signups start as <strong>viewer</strong> and must be promoted here.
        </p>
      </main>
    </div>
  );
}
