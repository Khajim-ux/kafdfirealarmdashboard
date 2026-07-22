import { useEffect, useRef, useState } from "react";
import { Bell, Check, AlertTriangle, Flame, ShieldAlert, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import type { Trouble, AlarmType } from "@/lib/constants";

type NotifKind = "created" | "updated";
interface Notif {
  id: string;
  troubleId: string;
  kind: NotifKind;
  alarmType: AlarmType;
  deviceId: string;
  parcel: string;
  location: string | null;
  at: string;
  read: boolean;
}

// Only these alarm types trigger notifications
const NOTIFY_TYPES: AlarmType[] = ["fire_alarm", "supervisory", "trouble"];

const TYPE_META: Record<AlarmType, { label: string; icon: React.ReactNode; toneClass: string }> = {
  fire_alarm:    { label: "Fire Alarm",   icon: <Flame className="h-4 w-4" />,         toneClass: "text-destructive" },
  supervisory:   { label: "Supervisory",  icon: <ShieldAlert className="h-4 w-4" />,   toneClass: "text-blue-600" },
  trouble:       { label: "Trouble",      icon: <AlertTriangle className="h-4 w-4" />, toneClass: "text-amber-600" },
  disabled:      { label: "Disabled",     icon: <ShieldAlert className="h-4 w-4" />,   toneClass: "text-muted-foreground" },
  monitor_alert: { label: "Monitor",      icon: <Activity className="h-4 w-4" />,      toneClass: "text-purple-600" },
};

const STORAGE_KEY = "fa-notifications-v1";
const MAX = 50;

export function NotificationsBell() {
  const [items, setItems] = useState<Notif[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
  });
  const [open, setOpen] = useState(false);
  const mountedAt = useRef<number>(Date.now());

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX))); } catch { /* ignore */ }
  }, [items]);

  useEffect(() => {
    const channel = supabase
      .channel("notifications-troubles")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "troubles" },
        (payload) => handleEvent(payload.new as Trouble, "created"),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "troubles" },
        (payload) => handleEvent(payload.new as Trouble, "updated"),
      )
      .subscribe();

    function handleEvent(row: Trouble, kind: NotifKind) {
      if (!row || !NOTIFY_TYPES.includes(row.alarm_type)) return;
      // Skip stale INSERTs replayed on subscribe
      if (kind === "created" && new Date(row.created_at).getTime() < mountedAt.current - 5000) return;

      const meta = TYPE_META[row.alarm_type];
      const title = `${meta.label} ${kind === "created" ? "created" : "updated"}`;
      const desc = `${row.device_id} · Parcel ${row.parcel}${row.location ? ` · ${row.location}` : ""}`;

      if (row.alarm_type === "fire_alarm") {
        toast.error(title, { description: desc, duration: 8000 });
      } else if (row.alarm_type === "supervisory") {
        toast.warning(title, { description: desc });
      } else {
        toast(title, { description: desc });
      }

      setItems((prev) => {
        const notif: Notif = {
          id: `${row.id}-${kind}-${Date.now()}`,
          troubleId: row.id,
          kind,
          alarmType: row.alarm_type,
          deviceId: row.device_id,
          parcel: row.parcel,
          location: row.location,
          at: new Date().toISOString(),
          read: false,
        };
        return [notif, ...prev].slice(0, MAX);
      });
    }

    return () => { supabase.removeChannel(channel); };
  }, []);

  const unread = items.filter((n) => !n.read).length;

  function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }
  function clearAll() {
    setItems([]);
  }

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) markAllRead(); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <Badge className="absolute -top-2 -right-2 h-5 min-w-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] leading-none flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-medium">Notifications</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={markAllRead} disabled={unread === 0}>
              <Check className="h-3 w-3 mr-1" />Read
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearAll} disabled={items.length === 0}>
              Clear
            </Button>
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No notifications yet</div>
          ) : (
            items.map((n) => {
              const meta = TYPE_META[n.alarmType];
              return (
                <div key={n.id} className={"flex gap-2 px-3 py-2 border-b last:border-b-0 " + (n.read ? "" : "bg-accent/40")}>
                  <div className={"mt-0.5 " + meta.toneClass}>{meta.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {meta.label} {n.kind === "created" ? "created" : "updated"}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {n.deviceId} · Parcel {n.parcel}{n.location ? ` · ${n.location}` : ""}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(n.at), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
