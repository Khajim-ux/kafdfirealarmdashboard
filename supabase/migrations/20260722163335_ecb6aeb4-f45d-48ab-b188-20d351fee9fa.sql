
DROP POLICY IF EXISTS troubles_insert_op_admin ON public.troubles;
DROP POLICY IF EXISTS troubles_update_op_admin ON public.troubles;
DROP POLICY IF EXISTS troubles_delete_admin ON public.troubles;

CREATE POLICY troubles_insert_staff ON public.troubles FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'operator'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR has_role(auth.uid(), 'engineer'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
);

CREATE POLICY troubles_update_staff ON public.troubles FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'operator'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR has_role(auth.uid(), 'engineer'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'operator'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR has_role(auth.uid(), 'engineer'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
);

CREATE POLICY troubles_delete_admin ON public.troubles FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
