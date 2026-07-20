export const PARCELS = [
  "5.01","5.02","5.03","5.04","5.05","5.07","5.08",
  "3.01","3.02","3.04","3.05","3.06","3.09","3.10","3.11",
] as const;

export const ALARM_TYPES = [
  { value: "trouble", label: "Trouble" },
  { value: "supervisory", label: "Supervisory" },
  { value: "fire_alarm", label: "Fire Alarm" },
  { value: "disabled", label: "Disabled" },
] as const;

export const STATUSES = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
] as const;

export const DEVICE_TYPES = [
  "Smoke Detector","Heat Detector","Pull Station","Sprinkler","Duct Detector",
  "Horn/Strobe","Control Module","Monitor Module","Panel","Other",
] as const;

export type AlarmType = "trouble" | "supervisory" | "fire_alarm" | "disabled";
export type TicketStatus = "open" | "closed";
export type AppRole = "admin" | "operator" | "viewer";

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
}
