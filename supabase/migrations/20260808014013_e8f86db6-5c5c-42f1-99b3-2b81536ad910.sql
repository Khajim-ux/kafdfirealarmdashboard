DROP POLICY IF EXISTS profiles_read_authenticated ON public.profiles;

CREATE POLICY profiles_read_own_or_admin
ON public.profiles
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));