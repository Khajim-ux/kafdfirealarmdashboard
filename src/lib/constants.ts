export const PARCELS = [
  "5.01","5.02","5.03","5.04","5.05","5.07","5.08",
  "3.01","3.02","3.04","3.05","3.06","3.09","3.10","3.11",
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

export const DEVICE_TYPES = [
  "Smoke Detector (SD)",
  "Heat Detector (HD)",
  "Beam Detector",
  "Duct Detector",
  "MCP",
  "Sounder",
  "Speaker",
  "Strobe",
  "Horn Strobe",
  "Monitor Module",
  "Control Module",
  "Isolator Module",
  "Flow Switch",
  "Tamper Switch",
  "Valve Supervisory",
  "CT1",
  "CT2",
  "CR",
  "CP",
  "CC1",
  "CC2",
  "CV",
  "Battery Trouble",
  "Power Trouble",
  "Network Trouble",
  "Missing Device",
  "Unprogrammed Device",
  "Open Fault",
  "Short Fault",
  "Open/Short Fault",
  "Ground Fault",
  "Card Missing",
  "Mixed List",
  "Auxiliary Relay",
  "Head Missing",
  "Dirty",
  "Excessively Dirty",
  "Disable Trouble",
  "No Answer",
  "Abnormal",
  "Communication Fault",
  "Loop Fault",
  "Earth Fault",
  "Device Failure",
  "Panel Trouble",
  "Panel Supervisory",
  "Monitor Active",
  "Alarm",
  "Supervisory",
  "Trouble",
  "Maintenance",
] as const;

export type AlarmType = "trouble" | "supervisory" | "fire_alarm" | "disabled" | "monitor_alert";
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
