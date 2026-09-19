-- Platform analytics for admins.
--
-- RLS scopes events, orders, tickets and requests to their owner or host, so an
-- admin sees nothing by default. Rather than punching admin-wide holes in every
-- policy, these functions run SECURITY DEFINER and check is_admin() themselves,
-- returning aggregates instead of raw rows. That keeps the blast radius small:
-- an admin gets counts and totals, not a dump of everyone's data.

create function public.platform_stats()
returns table (
  total_users bigint,
  new_users_7d bigint,
  total_events bigint,
  published_events bigint,
  upcoming_events bigint,
  total_rsvps bigint,
  tickets_issued bigint,
  tickets_checked_in bigint,
  orders_paid bigint,
  orders_pending bigint,
  gross_ngwee bigint,
  fees_ngwee bigint,
  pending_requests bigint,
  verified_hosts bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  -- SECURITY DEFINER bypasses RLS, so this check is what stands between an
  -- ordinary signed-in user and the whole platform's numbers.
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  return query
  select
    (select count(*) from auth.users),
    (select count(*) from auth.users u where u.created_at > now() - interval '7 days'),
    (select count(*) from public.events),
    (select count(*) from public.events e where e.status = 'published'),
    (select count(*) from public.events e where e.status = 'published' and e.starts_on >= current_date),
    (select count(*) from public.event_rsvps),
    (select count(*) from public.tickets t where t.status <> 'void'),
    (select count(*) from public.tickets t where t.status = 'checked_in'),
    (select count(*) from public.orders o where o.status = 'paid'),
    (select count(*) from public.orders o where o.status = 'pending'),
    (select coalesce(sum(o.total_ngwee), 0)::bigint from public.orders o where o.status = 'paid'),
    (select coalesce(sum(o.fee_ngwee), 0)::bigint from public.orders o where o.status = 'paid'),
    (select count(*) from public.guest_requests g where g.status = 'pending'),
    (select count(*) from public.profiles p where p.host_status = 'verified');
end $$;

-- Per-event breakdown for the table view.
create function public.platform_event_breakdown()
returns table (
  event_id uuid,
  name text,
  host_name text,
  category public.event_category,
  status public.event_status,
  starts_on date,
  rsvps bigint,
  tickets_sold bigint,
  checked_in bigint,
  gross_ngwee bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  return query
  select
    e.id,
    e.name,
    coalesce(nullif(e.host_display_name, ''), 'Unknown host'),
    e.category,
    e.status,
    e.starts_on,
    (select count(*) from public.event_rsvps r where r.event_id = e.id),
    (select count(*) from public.tickets t where t.event_id = e.id and t.status <> 'void'),
    (select count(*) from public.tickets t where t.event_id = e.id and t.status = 'checked_in'),
    (select coalesce(sum(o.total_ngwee), 0)::bigint
       from public.orders o where o.event_id = e.id and o.status = 'paid')
  from public.events e
  order by e.starts_on desc;
end $$;

-- Signups per day, for the trend line.
create function public.platform_signups(p_days integer default 30)
returns table (day date, signups bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  return query
  select d::date, (select count(*) from auth.users u where u.created_at::date = d::date)
  from generate_series(
    current_date - (greatest(least(coalesce(p_days, 30), 365), 1) - 1),
    current_date,
    interval '1 day'
  ) d
  order by d;
end $$;

revoke execute on function public.platform_stats() from public, anon;
revoke execute on function public.platform_event_breakdown() from public, anon;
revoke execute on function public.platform_signups(integer) from public, anon;
grant execute on function public.platform_stats() to authenticated;
grant execute on function public.platform_event_breakdown() to authenticated;
grant execute on function public.platform_signups(integer) to authenticated;
