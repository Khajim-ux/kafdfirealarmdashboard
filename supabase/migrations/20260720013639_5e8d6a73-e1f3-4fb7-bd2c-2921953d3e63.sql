
ALTER FUNCTION public.set_updated_at() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_role(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_trouble_change() FROM anon, authenticated, public;

-- Storage policies: authenticated users can read/upload/delete trouble photos
CREATE POLICY "trouble_photos_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'trouble-photos');
CREATE POLICY "trouble_photos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'trouble-photos');
CREATE POLICY "trouble_photos_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'trouble-photos');
CREATE POLICY "trouble_photos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'trouble-photos' AND public.has_role(auth.uid(),'admin'));
