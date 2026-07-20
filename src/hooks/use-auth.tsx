import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/constants";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null, session: null, role: null, loading: true, signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => { void fetchRole(s.user.id); }, 0);
      } else {
        setRole(null);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) void fetchRole(data.session.user.id);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function fetchRole(userId: string) {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .order("role", { ascending: true });
    if (data && data.length > 0) {
      // pick highest privilege
      const roles = data.map((r) => r.role as AppRole);
      if (roles.includes("admin")) setRole("admin");
      else if (roles.includes("operator")) setRole("operator");
      else setRole("viewer");
    } else {
      setRole("viewer");
    }
  }

  return (
    <Ctx.Provider
      value={{
        user: session?.user ?? null,
        session,
        role,
        loading,
        signOut: async () => { await supabase.auth.signOut(); },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
