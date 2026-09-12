CREATE TABLE public.daily_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel text NOT NULL,
  log_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Riyadh')::date,
  shift text NOT NULL DEFAULT 'DAY' CHECK (shift IN ('DAY','NIGHT')),
  event text NOT NULL DEFAULT 'CHECK IN' CHECK (event IN ('CHECK IN','CHECK OUT')),
  operator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  operator_name text,
  total_trouble integer NOT NULL DEFAULT 0,
  isolation_disabled integer NOT NULL DEFAULT 0,
  supervisory integer NOT NULL DEFAULT 0,
  maintenance_alert integer NOT NULL DEFAULT 0,
  ground_fault integer NOT NULL DEFAULT 0,
  open_short integer NOT NULL DEFAULT 0,
  fire_incident integer NOT NULL DEFAULT 0,
  isolated_area text,
  remarks text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX daily_logs_parcel_date_idx ON public.daily_logs (parcel, log_date DESC);

CREATE TRIGGER daily_logs_set_updated_at BEFORE UPDATE ON public.daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_logs TO authenticated;
GRANT ALL ON public.daily_logs TO service_role;

ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY daily_logs_read_staff ON public.daily_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'engineer') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'viewer'));

CREATE POLICY daily_logs_insert_staff ON public.daily_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'engineer') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'operator'));

CREATE POLICY daily_logs_update_staff ON public.daily_logs FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'engineer') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'operator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'engineer') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'operator'));

CREATE POLICY daily_logs_delete_admin ON public.daily_logs FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));