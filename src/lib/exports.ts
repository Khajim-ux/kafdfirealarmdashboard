import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import type { Trouble } from "./constants";
import { format } from "date-fns";

export async function generateQrDataUrl(text: string) {
  return QRCode.toDataURL(text, { width: 256, margin: 1 });
}

export function exportToExcel(rows: Trouble[], filename = "troubles.xlsx") {
  const data = rows.map((r) => ({
    "Device ID": r.device_id,
    Panel: r.panel ?? "",
    Location: r.location ?? "",
    Parcel: r.parcel,
    Floor: r.floor ?? "",
    "Device Type": r.device_type ?? "",
    "Alarm Type": r.alarm_type,
    Status: r.status,
    Operator: r.technician ?? "",
    Tenant: r.tenant ?? "",
    Description: r.description ?? "",
    "Event At": r.event_at,
    "Closed At": r.closed_at ?? "",
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Troubles");
  XLSX.writeFile(wb, filename);
}

export function exportToPdf(rows: Trouble[], filename = "troubles.pdf") {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text("Fire Alarm — Troubles Report", 14, 14);
  doc.setFontSize(9);
  doc.text(`Generated ${format(new Date(), "yyyy-MM-dd HH:mm")}   Records: ${rows.length}`, 14, 20);
  autoTable(doc, {
    startY: 24,
    head: [["Device ID", "Parcel", "Floor", "Device/Event", "Type", "Status", "Operator", "Tenant", "Event"]],
    body: rows.map((r) => [
      r.device_id, r.parcel, r.floor ?? "", r.device_type ?? "", r.alarm_type, r.status,
      r.technician ?? "", r.tenant ?? "",
      format(new Date(r.event_at), "yyyy-MM-dd HH:mm"),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [220, 38, 38] },
  });
  doc.save(filename);
}
