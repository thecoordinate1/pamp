-- Column protection and auth.users sync.

create function public.protect_profile_columns() returns trigger
language plpgsql as $$
begin
  if public.is_privileged() then
    return new;
  end if;
  new.id := old.id;
  new.host_status := old.host_status;
  new.created_at := old.created_at;
  return new;
end $$;

create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_columns();

create function public.protect_account_private_columns() returns trigger
language plpgsql as $$
begin
  if public.is_privileged() then
    return new;
  end if;
  new.user_id := old.user_id;
  new.phone := old.phone;
  new.email := old.email;
  new.is_admin := old.is_admin;
  new.is_suspended := old.is_suspended;
  new.created_at := old.created_at;
  -- Date of birth gates age-restricted events, so it can only be set once.
  if old.birth_date is not null then
    new.birth_date := old.birth_date;
  elsif new.birth_date is not null and new.birth_date > current_date - interval '13 years' then
    raise exception 'You must be at least 13 to use PAMP' using errcode = '22023';
  end if;
  -- Terms acceptance can be recorded but not withdrawn through the API.
  if old.terms_accepted_at is not null then
    new.terms_accepted_at := old.terms_accepted_at;
  elsif new.terms_accepted_at is not null then
    new.terms_accepted_at := now();
  end if;
  return new;
end $$;

create trigger account_private_protect before update on public.account_private
  for each row execute function public.protect_account_private_columns();

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60));
  insert into public.account_private (user_id, phone, email)
  values (new.id, nullif(new.phone, ''), nullif(new.email, ''));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.handle_user_contact_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.account_private
     set phone = nullif(new.phone, ''), email = nullif(new.email, '')
   where user_id = new.id;
  return new;
end $$;

create trigger on_auth_user_contact_changed after update of phone, email on auth.users
  for each row execute function public.handle_user_contact_change();

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_contact_change() from public, anon, authenticated;
