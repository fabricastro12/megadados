-- Tightening from the Supabase security advisor.
-- The topic and membership helpers only back policies for signed-in users, so callers without a
-- session do not need them. is_admin() stays callable by anon: the categories policy uses it.
revoke execute on function public.can_receive_topic(text) from public, anon;
revoke execute on function public.can_send_topic(text, text) from public, anon;
revoke execute on function public.is_room_member(uuid) from public, anon;
revoke execute on function public.my_role_in(uuid) from public, anon;
revoke execute on function public.room_for_topic(text) from public, anon;
-- Revoking from public also drops any grant inherited through it, so give it back explicitly.
grant execute on function public.can_receive_topic(text), public.can_send_topic(text, text), public.is_room_member(uuid),
  public.my_role_in(uuid), public.room_for_topic(text) to authenticated;

-- A trigger function is never called directly.
revoke execute on function public.touch_room_activity() from public, anon, authenticated;

alter function public.touch_updated_at() set search_path = '';
