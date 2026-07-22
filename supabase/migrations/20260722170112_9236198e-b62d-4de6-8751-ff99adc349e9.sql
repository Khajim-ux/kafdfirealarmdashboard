
-- 1. Restrict troubles read to staff roles
DROP POLICY IF EXISTS troubles_read_all_auth ON public.troubles;
CREATE POLICY troubles_read_staff ON public.troubles
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin'::app_role) OR
    has_role(auth.uid(),'manager'::app_role) OR
    has_role(auth.uid(),'engineer'::app_role) OR
    has_role(auth.uid(),'supervisor'::app_role) OR
    has_role(auth.uid(),'operator'::app_role) OR
    has_role(auth.uid(),'viewer'::app_role)
  );

-- 2. Restrict audit_log read to admins
DROP POLICY IF EXISTS audit_read_all_auth ON public.audit_log;
CREATE POLICY audit_read_admin ON public.audit_log
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role));

-- 3. Remove permissive insert on audit_log; trigger is SECURITY DEFINER and bypasses RLS
DROP POLICY IF EXISTS audit_insert_any ON public.audit_log;
CREATE POLICY audit_insert_admin ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

-- 4. Storage: tighten trouble-photos policies
DROP POLICY IF EXISTS trouble_photos_insert ON storage.objects;
DROP POLICY IF EXISTS trouble_photos_update ON storage.objects;

CREATE POLICY trouble_photos_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'trouble-photos'
    AND owner = auth.uid()
    AND (
      has_role(auth.uid(),'admin'::app_role) OR
      has_role(auth.uid(),'manager'::app_role) OR
      has_role(auth.uid(),'engineer'::app_role) OR
      has_role(auth.uid(),'supervisor'::app_role) OR
      has_role(auth.uid(),'operator'::app_role)
    )
  );

CREATE POLICY trouble_photos_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'trouble-photos'
    AND (owner = auth.uid() OR has_role(auth.uid(),'admin'::app_role))
  )
  WITH CHECK (
    bucket_id = 'trouble-photos'
    AND (owner = auth.uid() OR has_role(auth.uid(),'admin'::app_role))
  );

-- 5. Revoke direct EXECUTE on SECURITY DEFINER helpers. Trigger functions
-- don't need public/authenticated EXECUTE. Keep has_role executable by
-- authenticated because RLS policies call it in the caller's role context.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_trouble_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_role(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role(uuid) TO authenticated;
