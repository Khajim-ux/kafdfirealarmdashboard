
## Scope

Large expansion of the Records module. Adds many new columns to `troubles`, replaces/extends dropdown lists, introduces a lightweight user-profile system (name + employee ID), adds photo status, richer filters, CSV export, and new dashboard counters. Keeps existing UI style and role/RBAC unchanged.

## Assumptions (please confirm or correct)

1. `Tower` = the existing **Parcel** field (dashboard already scopes by parcel). I'll rename the label to "Tower" in the UI but keep the DB column `parcel` to preserve data. If Tower is a *new* separate concept, tell me and I'll add a distinct column.
2. `Event Type` (Fire/Alarm/Warning/Trouble/Fault/Supervisory/Monitor/Disablement/Maintenance/Test/Restore/FM-200/CO2/Other) replaces the current 5-value `alarm_type` enum. I'll add a new `event_type text` column (free text with searchable dropdown) so the change is non-destructive; the legacy `alarm_type` column stays for existing rows and is auto-mapped where possible.
3. New "Device/Event List" (~60 items) replaces the current `DEVICE_TYPES` constant list. The `device_type` column stays as free text so old rows keep their value.
4. User Name / User ID / Role display: I'll add a `profiles` table (`user_id`, `full_name`, `employee_id`) and a small "My Profile" editor. The Records table joins profile info for `created_by` / `updated_by` — display format `Full Name (EMP-ID) – Role`.
5. "Technician" stays as free text (separate from the logged-in user).

## Database migration

New columns on `public.troubles`:
- `tower text` *(optional; only if you say Tower ≠ Parcel — otherwise skipped)*
- `loop text`, `zone text`, `device_number text`
- `event_type text` (searchable dropdown; nullable, backfilled from `alarm_type`)
- `fault_name text`, `priority text` (Low/Medium/High/Critical), `active_status text` (Active/Restore)
- `cause text`, `action_taken text`, `remarks text`, `attachment_url text`
- `photo_status text` (No Photo / Before / After / Before & After / Uploaded)

New table `public.profiles`:
- `user_id uuid PK → auth.users`, `full_name text`, `employee_id text`
- RLS: users can read/update their own row; staff roles can read all (for display in tables); GRANTs to authenticated + service_role.
- Trigger extension of `handle_new_user()` to insert an empty profile row.

## Frontend changes

- `src/lib/constants.ts` — new `EVENT_TYPES`, replaced `DEVICE_TYPES`, `PHOTO_STATUSES`, `PRIORITIES`, `ACTIVE_STATUSES`; extend `Trouble` interface with new fields.
- `src/components/trouble-form-dialog.tsx` — add inputs for Loop, Zone, Device Number, Event Type (searchable), Fault Name, Priority, Active Status, Cause, Action Taken, Remarks, Photo Status, Attachment upload. Rename "Parcel" label → "Tower".
- `src/routes/index.tsx`:
  - Records table: new columns per spec, with photo icon (📷 tinted by status), user display "Name (EMP-ID) – Role".
  - Filters row: add Date Range (from/to), Tower, Event Type, User Name, User ID (Employee ID), keep existing Floor/Status/Device Type/Technician.
  - Dashboard KPI counters: Fire, Alarm, Warning, Fault, Trouble, Supervisory, Monitor, Disablement, FM-200, CO2, Restore, Active — computed from `event_type` / `active_status`.
- `src/lib/exports.ts` — add `exportToCsv()`, extend Excel/PDF with all new columns.
- New `src/routes/profile.tsx` — user edits their own Full Name + Employee ID.
- User info join: fetch `profiles` + `user_roles` once, map by `user_id` for table display.

## Realtime / responsive

- Existing realtime subscription on `troubles` covers the new columns automatically.
- Table wraps to horizontal scroll on mobile (already the pattern); filters stack.

## Out of scope (unless you ask)

- Custom priority auto-assignment rules per event type.
- Multi-file attachments (single `attachment_url` for now).
- Editing other users' profiles (admin-only profile editor).

Confirm the Tower vs Parcel question (item 1) and I'll implement. If you'd rather I just proceed with "Tower = Parcel (label rename only)", say "go".
