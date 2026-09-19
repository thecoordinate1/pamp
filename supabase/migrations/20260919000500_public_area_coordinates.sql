-- 20260919000100 put latitude/longitude in event_private so exact addresses stay
-- with approved guests. That also hid them from the map, which has to plot every
-- published event for people who have not RSVP'd yet.
--
-- Split the two: an approximate, neighbourhood-level point is public and drives
-- the map; the exact address and precise coordinates stay in event_private.

alter table public.events
  add column area_latitude double precision check (area_latitude between -90 and 90),
  add column area_longitude double precision check (area_longitude between -180 and 180);

comment on column public.events.area_latitude is
  'Neighbourhood-level position for the public map. Never the exact address: use event_private for that.';

-- Rounds a precise point to roughly 1km so a public pin cannot be used to find
-- the house. Hosts who set an exact point still only expose the rounded one.
create function public.round_to_area(p_value double precision) returns double precision
language sql immutable as $$
  select round(p_value::numeric, 2)::double precision
$$;

-- When a host writes an exact point, derive the public one automatically so the
-- two cannot drift apart or be set inconsistently by the client.
create function public.sync_area_coordinates() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.events
     set area_latitude = public.round_to_area(new.latitude),
         area_longitude = public.round_to_area(new.longitude)
   where id = new.event_id
     and new.latitude is not null
     and new.longitude is not null;
  return new;
end $$;

create trigger event_private_sync_area
  after insert or update of latitude, longitude on public.event_private
  for each row execute function public.sync_area_coordinates();
