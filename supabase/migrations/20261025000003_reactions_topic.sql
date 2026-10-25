-- Reactions get their own topic, "room:<CODE>:fun", that every member may send to and receive.
-- With at most a dozen players the fan-out is tiny, and the room topic stays server-only.

create or replace function public.can_receive_topic(topic text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when topic ~ '^room:[A-Z0-9]{5}$' then public.is_room_member(public.room_for_topic(topic))
    when topic ~ '^room:[A-Z0-9]{5}:fun$' then public.is_room_member(public.room_for_topic(topic))
    when topic ~ '^room:[A-Z0-9]{5}:screens$' then public.my_role_in(public.room_for_topic(topic)) in ('host', 'spectator')
    else false
  end;
$$;

create or replace function public.can_send_topic(topic text, extension text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when topic ~ '^room:[A-Z0-9]{5}$' then extension = 'presence' and public.is_room_member(public.room_for_topic(topic))
    when topic ~ '^room:[A-Z0-9]{5}:fun$' then extension = 'broadcast' and public.is_room_member(public.room_for_topic(topic))
    else false
  end;
$$;
