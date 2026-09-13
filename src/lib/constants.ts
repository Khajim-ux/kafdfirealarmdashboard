export const PARCELS = [
  "1.01","1.02","1.03","1.04","1.05","1.06","1.07","1.08","1.09","1.10","1.11","1.12","1.13","1.14","1.15","1.16","1.17","1.18","1.19",
  "2.01","2.02","2.03","2.04","2.05","2.06","2.07","2.08","2.09","2.10","2.11","2.12","2.13","2.14","2.15",
  "3.01","3.02","3.03","3.04","3.05","3.06","3.07","3.08","3.09","3.10","3.11",
  "4.01","4.02","4.03","4.04","4.05","4.06","4.07","4.08","4.09","4.10","4.11","4.12",
  "5.01","5.02","5.03","5.04","5.05","5.06","5.07","5.08",
  "A.01","A.02","A.03","A.04","A.05","A.06","A.07","A.08","A.09","A.10","A.11","A.12",
] as const;

export const ALARM_TYPES = [
  { value: "trouble", label: "Trouble" },
  { value: "supervisory", label: "Supervisory" },
  { value: "fire_alarm", label: "Fire Alarm" },
  { value: "disabled", label: "Disabled" },
  { value: "monitor_alert", label: "Monitor Alert" },
] as const;

export const STATUSES = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
] as const;

export const EVENT_TYPES = [
  "Fire / Alarm","Warning","Trouble","Fault","Supervisory","Monitor",
  "Disablement","Maintenance","Test","Restore","FM-200","CO2","Other",
] as const;

/** Legacy rows may store "Fire" or "Alarm" separately — show them as one column. */
export function normalizeEventType(t: string | null | undefined) {
  if (!t) return null;
  return t === "Fire" || t === "Alarm" ? "Fire / Alarm" : t;
}


export const DEVICE_TYPES = [
  "Mains Failed",
  "Mains Failure (AC Power Loss)",
  "Battery Fault",
  "Battery Discharged",
  "Battery Disconnected",
  "Battery Near End of Life",
  "Earth Fault",
  "Earth/Ground Fault",
  "Loop Open Circuit",
  "Loop Short Circuit",
  "Wiring Changed",
  "Lost Device",
  "Device Missing",
  "Device Failed",
  "Device Mains Failed",
  "Device Battery Fault",
  "Device Address Conflict",
  "Sensor Out of Specification",
  "Detector Dirty",
  "Detector Drift Compensation Limit",
  "Detector Maintenance Required",
  "Sensor Drift Warning",
  "Detector Disabled",
  "MCP Disabled",
  "Sounders Disabled",
  "Zone Disabled",
  "Loop Disabled",
  "Output Disabled",
  "Sounder Fault",
  "Sounder Circuit Fault",
  "Sounder Open/Short Circuit",
  "Interface Input Open Circuit (O/C)",
  "Interface Input Short Circuit (S/C)",
  "Network Communication Fault",
  "Network Fault",
  "Network Delay Warning",
  "Panel Communication Fault",
  "Repeater Panel Communication Fault",
  "PSU (Power Supply Unit) Fault",
  "Fuse Fault",
  "Printer Fault",
  "Fire Routing Fault",
  "Alarm Routing Fault",
  "System Fault",
  "Configuration Changed",
  "Delay Mode Active",
  "Disablement Active",
  "Event Log Almost Full",
  "Event Log Full/Nearly Full",
  "Time/Date Incorrect",
  "High Temperature Warning",
  "Low Temperature Warning",
  "Flow Switch Active",
  "Pressure Switch Active",
  "Valve Tamper",
  "Fire Pump Running",
  "Generator Running",
  "Sprinkler System Supervisory",
  "Gas Suppression Supervisory",
  "FM-200",
  "CO2",
  "Other",
] as const;

export const PHOTO_STATUSES = [
  "No Photo","Before Photo","After Photo","Before & After","Uploaded",
] as const;

export const PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;

export const ACTIVE_STATUSES = ["Active", "Restore"] as const;

export type AlarmType = "trouble" | "supervisory" | "fire_alarm" | "disabled" | "monitor_alert";
export type TicketStatus = "open" | "closed";
export type AppRole = "admin" | "manager" | "engineer" | "supervisor" | "operator" | "viewer";

export const ASSIGNABLE_ROLES: AppRole[] = ["admin", "manager", "supervisor", "engineer", "operator"];


// Permission helpers — mirror backend RLS policies.
export function canViewTicket(role: AppRole | null) {
  return !!role;
}
export function canOpenTicket(role: AppRole | null) {
  return role !== null && role !== "viewer";
}
export function canEditTicket(role: AppRole | null) {
  return role !== null && role !== "viewer";
}
export function canCloseTicket(role: AppRole | null) {
  return role !== null && role !== "viewer";
}
export function canDeleteTicket(role: AppRole | null) {
  return role === "admin";
}
export function canManageUsers(role: AppRole | null) {
  return role === "admin";
}

export interface Trouble {
  id: string;
  device_id: string;
  panel: string | null;
  location: string | null;
  parcel: string;
  floor: string | null;
  device_type: string | null;
  alarm_type: AlarmType;
  status: TicketStatus;
  description: string | null;
  technician: string | null;
  tenant: string | null;
  photo_url: string | null;
  qr_code: string | null;
  event_at: string;
  closed_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  loop: string | null;
  zone: string | null;
  device_number: string | null;
  event_type: string | null;
  fault_name: string | null;
  priority: string | null;
  active_status: string;
  cause: string | null;
  action_taken: string | null;
  remarks: string | null;
  attachment_url: string | null;
  photo_status: string;
}

export interface Profile {
  user_id: string;
  full_name: string | null;
  employee_id: string | null;
}

export function formatUser(
  id: string | null | undefined,
  profiles: Record<string, Profile>,
  roles: Record<string, string>,
) {
  if (!id) return "—";
  const p = profiles[id];
  const name = p?.full_name || "Unknown user";
  const emp = p?.employee_id || id.slice(0, 8);
  const role = roles[id];
  return `${name} (${emp})${role ? ` - ${role}` : ""}`;
}

