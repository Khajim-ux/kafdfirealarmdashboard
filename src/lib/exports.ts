import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { normalizeEventType, type Trouble } from "./constants";
import { format } from "date-fns";

export async function generateQrDataUrl(text: string) {
  return QRCode.toDataURL(text, { width: 256, margin: 1 });
}

type UserLabel = (id: string | null) => string;

function fmtDate(iso: string) {
  try { return format(new Date(iso), "yyyy-MM-dd"); } catch { return iso; }
}
function fmtTime(iso: string) {
  try { return format(new Date(iso), "HH:mm"); } catch { return ""; }
}

export function toRecordRows(rows: Trouble[], userLabel: UserLabel = () => "") {
  return rows.map((r) => ({
    Date: fmtDate(r.event_at),
    Time: fmtTime(r.event_at),
    Tower: r.parcel,
    Floor: r.floor ?? "",
    Panel: r.panel ?? "",
    Loop: r.loop ?? "",
    Zone: r.zone ?? "",
    "Device Type": r.device_type ?? "",
    "Device Number": r.device_number ?? "",
    "Event Type": normalizeEventType(r.event_type) ?? "",
    "Fault/Warning Name": r.fault_name ?? "",
    Priority: r.priority ?? "",
    Status: r.active_status ?? "",
    Cause: r.cause ?? "",
    "Action Taken": r.action_taken ?? "",
    Operator: r.technician ?? "",
    "User Name": userLabel(r.created_by),
    "User ID": r.created_by ?? "",
    "Photo Status": r.photo_status ?? "",
    Attachment: r.attachment_url ?? r.photo_url ?? "",
    Remarks: r.remarks ?? r.description ?? "",
  }));
}

export function exportToExcel(rows: Trouble[], userLabel?: UserLabel, filename = "fire-alarm-records.xlsx") {
  const ws = XLSX.utils.json_to_sheet(toRecordRows(rows, userLabel));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Records");
  XLSX.writeFile(wb, filename);
}

export function exportToCsv(rows: Trouble[], userLabel?: UserLabel, filename = "fire-alarm-records.csv") {
  const data = toRecordRows(rows, userLabel);
  const headers = data.length ? Object.keys(data[0]) : [];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.join(","), ...data.map((d) => headers.map((h) => esc((d as Record<string, unknown>)[h])).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function exportToPdf(rows: Trouble[], userLabel: UserLabel = () => "", filename = "fire-alarm-records.pdf") {
  const doc = new jsPDF({ orientation: "landscape", format: "a3" });
  doc.setFontSize(14);
  doc.text("Fire Alarm — Records Report", 14, 14);
  doc.setFontSize(9);
  doc.text(`Generated ${format(new Date(), "yyyy-MM-dd HH:mm")}   Records: ${rows.length}`, 14, 20);
  autoTable(doc, {
    startY: 24,
    head: [[
      "Date", "Time", "Tower", "Floor", "Panel", "Loop", "Zone", "Device Type", "Dev #",
      "Event Type", "Fault/Warning", "Priority", "Status", "Cause", "Action Taken",
      "Operator", "User", "Photo", "Remarks",
    ]],
    body: rows.map((r) => [
      fmtDate(r.event_at), fmtTime(r.event_at), r.parcel, r.floor ?? "", r.panel ?? "",
      r.loop ?? "", r.zone ?? "", r.device_type ?? "", r.device_number ?? "",
      r.event_type ?? "", r.fault_name ?? "", r.priority ?? "", r.active_status ?? "",
      r.cause ?? "", r.action_taken ?? "", r.technician ?? "", userLabel(r.created_by),
      r.photo_status ?? "", r.remarks ?? r.description ?? "",
    ]),
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [220, 38, 38] },
  });
  doc.save(filename);
}
