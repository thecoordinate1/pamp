-- Payments a person has to look at, and buyers' numbers kept from hosts.
--
-- 1. When Lenco reports money that does not fit its order (paid after the hold
--    ran out, the wrong amount or currency, a reference that does not match),
--    no pass is issued. Until now the only trace was a line in the Edge
--    Function log, so a customer could pay and nobody would know to refund
--    them. The functions now record each case here, and admins see the list
--    with what they need to refund: the buyer, their number and Lenco's
--    reference.
-- 2. Hosts can read orders for their events, which included the buyer's mobile
--    money number. Hosts need totals, not numbers. (Security review
--    2026-10-04, finding A3.) The number stays readable by the service role,
--    which the payment functions use, and comes back to the buyer from
--    create_order.

-- 1 ---------------------------------------------------------------------------

create table public.payment_reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  reason text not null check (reason in ('order_not_payable', 'amount_mismatch', 'reference_mismatch')),
  provider_reference text,
  -- What the provider says was paid, as it reported it.
  amount text,
  currency text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolution text check (char_length(resolution) <= 500),
  -- A webhook and a poll can both find the same problem: record it once.
  unique (order_id, reason)
);
create index payment_reviews_open_idx on public.payment_reviews (created_at) where resolved_at is null;

alter table public.payment_reviews enable row level security;
-- Written by the payment functions with the service role; read by admins
-- through payments_to_review(). No browser reads or writes the table itself.
revoke all on public.payment_reviews from anon, authenticated;

create function public.payments_to_review()
returns table (
  review_id uuid,
  order_id uuid,
  reason text,
  provider_reference text,
  amount text,
  currency text,
  order_status public.order_status,
  order_total_ngwee integer,
  buyer_name text,
  buyer_msisdn text,
  event_name text,
  flagged_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  return query
    select r.id, r.order_id, r.reason, r.provider_reference, r.amount, r.currency,
           o.status, o.total_ngwee, p.display_name, o.msisdn, e.name, r.created_at
      from public.payment_reviews r
      join public.orders o on o.id = r.order_id
      left join public.profiles p on p.id = o.user_id
      left join public.events e on e.id = o.event_id
     where r.resolved_at is null
     order by r.created_at;
end $$;

-- Marks a case dealt with, such as refunded through Lenco, with a note.
create function public.resolve_payment_review(p_review uuid, p_resolution text)
returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  update public.payment_reviews
     set resolved_at = now(), resolved_by = (select auth.uid()),
         resolution = left(btrim(coalesce(p_resolution, '')), 500)
   where id = p_review and resolved_at is null;
  return found;
end $$;

revoke execute on function public.payments_to_review() from public, anon;
revoke execute on function public.resolve_payment_review(uuid, text) from public, anon;
grant execute on function public.payments_to_review() to authenticated;
grant execute on function public.resolve_payment_review(uuid, text) to authenticated;

-- 2 ---------------------------------------------------------------------------

-- Column privileges: every order column except msisdn. A column added to
-- orders later is unreadable by browsers until it is granted here too.
revoke select on public.orders from authenticated;
grant select (
  id, event_id, user_id, quantity, unit_price_ngwee, subtotal_ngwee, fee_ngwee,
  total_ngwee, status, method, provider_reference, expires_at, paid_at,
  created_at, updated_at, points_used, points_discount_ngwee
) on public.orders to authenticated;
