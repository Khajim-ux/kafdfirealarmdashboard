import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
  head: () => ({
    meta: [
      { title: "My Profile — Fire Alarm Management" },
      { name: "description", content: "Set your display name and employee ID shown on fire alarm records." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "My Profile — Fire Alarm Management" },
      { property: "og:description", content: "Set your display name and employee ID shown on fire alarm records." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "My Profile — Fire Alarm Management" },
      { name: "twitter:description", content: "Set your display name and employee ID shown on fire alarm records." },
    ],
  }),
});

function ProfilePage() {
  const navigate = useNavigate();
  const { user, role, loading } = useAuth();
  const [fullName, setFullName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data } = await supabase.from("profiles").select("full_name, employee_id").eq("user_id", user.id).maybeSingle();
      setFullName(data?.full_name ?? "");
      setEmployeeId(data?.employee_id ?? "");
    })();
  }, [user]);

  async function save() {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .upsert({ user_id: user.id, full_name: fullName || null, employee_id: employeeId || null }, { onConflict: "user_id" });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Profile saved");
  }

  if (loading || !user) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;

  return (
    <main className="min-h-screen bg-background p-4">
      <div className="max-w-lg mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/" })}><ArrowLeft className="h-4 w-4 mr-1" aria-hidden />Back to dashboard</Button>
        <Card>
          <CardHeader><CardTitle><h1 className="text-lg font-semibold">My Profile</h1></CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">{user.email} · <Badge variant="secondary">{role ?? "viewer"}</Badge></div>
            <div className="space-y-1">
              <Label htmlFor="full-name">User Name</Label>
              <Input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Mohammed Khajim" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="emp-id">User ID (Employee ID)</Label>
              <Input id="emp-id" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="EMP-1025" />
            </div>
            <p className="text-xs text-muted-foreground">Records will show: {fullName || "Name"} ({employeeId || "EMP-ID"}) - {role ?? "viewer"}</p>
            <Button onClick={save} disabled={busy}>Save profile</Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
