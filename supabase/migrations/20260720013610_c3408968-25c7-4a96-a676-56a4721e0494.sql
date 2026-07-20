
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin','operator','viewer');
CREATE TYPE public.alarm_type AS ENUM ('trouble','supervisory','fire_alarm','disabled');
CREATE TYPE public.ticket_status AS ENUM ('open','closed');

-- Roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role) $$;

CREATE OR REPLACE FUNCTION public.get_my_role(_user_id uuid)
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id=_user_id
  ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'operator' THEN 2 ELSE 3 END LIMIT 1
$$;

CREATE POLICY "roles_self_read" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "roles_admin_manage" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Auto-assign role on signup: first user = admin, rest = viewer
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  user_count int;
BEGIN
  SELECT count(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'viewer');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Main troubles/tickets table
CREATE TABLE public.troubles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  panel text,
  location text,
  parcel text NOT NULL,
  floor text,
  device_type text,
  alarm_type public.alarm_type NOT NULL DEFAULT 'trouble',
  status public.ticket_status NOT NULL DEFAULT 'open',
  description text,
  technician text,
  tenant text,
  photo_url text,
  qr_code text,
  event_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.troubles TO authenticated;
GRANT ALL ON public.troubles TO service_role;
ALTER TABLE public.troubles ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_troubles_event_at ON public.troubles(event_at DESC);
CREATE INDEX idx_troubles_parcel ON public.troubles(parcel);
CREATE INDEX idx_troubles_status ON public.troubles(status);
CREATE INDEX idx_troubles_type ON public.troubles(alarm_type);

-- Viewers can read, operators can insert/update, admins can do everything
CREATE POLICY "troubles_read_all_auth" ON public.troubles FOR SELECT TO authenticated USING (true);
CREATE POLICY "troubles_insert_op_admin" ON public.troubles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'));
CREATE POLICY "troubles_update_op_admin" ON public.troubles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'));
CREATE POLICY "troubles_delete_admin" ON public.troubles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_troubles_updated
BEFORE UPDATE ON public.troubles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Audit log
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL,
  actor uuid,
  changes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_read_all_auth" ON public.audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "audit_insert_any" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX idx_audit_created ON public.audit_log(created_at DESC);

CREATE OR REPLACE FUNCTION public.log_trouble_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log(table_name,record_id,action,actor,changes)
    VALUES('troubles', NEW.id, 'INSERT', auth.uid(), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log(table_name,record_id,action,actor,changes)
    VALUES('troubles', NEW.id, 'UPDATE', auth.uid(),
      jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log(table_name,record_id,action,actor,changes)
    VALUES('troubles', OLD.id, 'DELETE', auth.uid(), to_jsonb(OLD));
    RETURN OLD;
  END IF;
END; $$;

CREATE TRIGGER trg_troubles_audit
AFTER INSERT OR UPDATE OR DELETE ON public.troubles
FOR EACH ROW EXECUTE FUNCTION public.log_trouble_change();

-- Enable realtime
ALTER TABLE public.troubles REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.troubles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_log;
