-- Demo data for PAMP, generated from the original src/data/eventsData.js.
-- Run on demand:  psql "$DATABASE_URL" -f supabase/seed.sql
--
-- Everything lives in the 00000000-0000-4000-* uuid range, so the cleanup
-- below removes all of it without touching real data.
-- These accounts cannot sign in: PAMP uses Google and they have no identity row.

delete from auth.users where id::text like '00000000-0000-4000-8000-%';
delete from public.events where id::text like '00000000-0000-4000-9000-%';

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'demo1@pamp.local', '', now(), now(), now(), '{"provider":"demo","providers":["demo"]}', jsonb_build_object('display_name', 'Bwalya M.')),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'demo2@pamp.local', '', now(), now(), now(), '{"provider":"demo","providers":["demo"]}', jsonb_build_object('display_name', 'Kambole C.')),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'demo3@pamp.local', '', now(), now(), now(), '{"provider":"demo","providers":["demo"]}', jsonb_build_object('display_name', 'Chileshe K.')),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'demo4@pamp.local', '', now(), now(), now(), '{"provider":"demo","providers":["demo"]}', jsonb_build_object('display_name', 'Sikwanda T.')),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'demo5@pamp.local', '', now(), now(), now(), '{"provider":"demo","providers":["demo"]}', jsonb_build_object('display_name', 'Natasha P.')),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'demo6@pamp.local', '', now(), now(), now(), '{"provider":"demo","providers":["demo"]}', jsonb_build_object('display_name', 'Mwila K.')),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'demo7@pamp.local', '', now(), now(), now(), '{"provider":"demo","providers":["demo"]}', jsonb_build_object('display_name', 'Chanda M.')),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'demo8@pamp.local', '', now(), now(), now(), '{"provider":"demo","providers":["demo"]}', jsonb_build_object('display_name', 'Sepo L.')),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000009', 'authenticated', 'authenticated', 'demo9@pamp.local', '', now(), now(), now(), '{"provider":"demo","providers":["demo"]}', jsonb_build_object('display_name', 'Mapalo S.')),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000010', 'authenticated', 'authenticated', 'demo10@pamp.local', '', now(), now(), now(), '{"provider":"demo","providers":["demo"]}', jsonb_build_object('display_name', 'Luyando M.')),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000011', 'authenticated', 'authenticated', 'demo11@pamp.local', '', now(), now(), now(), '{"provider":"demo","providers":["demo"]}', jsonb_build_object('display_name', 'Bwembya N.')),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000012', 'authenticated', 'authenticated', 'demo12@pamp.local', '', now(), now(), now(), '{"provider":"demo","providers":["demo"]}', jsonb_build_object('display_name', 'Victor H.')),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000013', 'authenticated', 'authenticated', 'demo13@pamp.local', '', now(), now(), now(), '{"provider":"demo","providers":["demo"]}', jsonb_build_object('display_name', 'Kondwani B.')),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000014', 'authenticated', 'authenticated', 'demo14@pamp.local', '', now(), now(), now(), '{"provider":"demo","providers":["demo"]}', jsonb_build_object('display_name', 'Natasha B.')),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000015', 'authenticated', 'authenticated', 'demo15@pamp.local', '', now(), now(), now(), '{"provider":"demo","providers":["demo"]}', jsonb_build_object('display_name', 'Mwamba J.')),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000016', 'authenticated', 'authenticated', 'demo16@pamp.local', '', now(), now(), now(), '{"provider":"demo","providers":["demo"]}', jsonb_build_object('display_name', 'Mutale C.')),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000017', 'authenticated', 'authenticated', 'demo17@pamp.local', '', now(), now(), now(), '{"provider":"demo","providers":["demo"]}', jsonb_build_object('display_name', 'Chisala R.'));

-- handle_new_user() already created the profile rows; fill in the rest.
update public.profiles set display_name = 'Bwalya M.', headline = '', looking_for = '', social_platform = 'instagram', social_handle = 'bwalyam' where id = '00000000-0000-4000-8000-000000000001';
update public.profiles set display_name = 'Kambole C.', headline = 'Senior Frontend Engineer', looking_for = 'Co-founders & Designers', social_platform = 'instagram', social_handle = 'kambolec' where id = '00000000-0000-4000-8000-000000000002';
update public.profiles set display_name = 'Chileshe K.', headline = 'Venture Analyst', looking_for = 'Fintech Startups', social_platform = 'instagram', social_handle = 'chileshek' where id = '00000000-0000-4000-8000-000000000003';
update public.profiles set display_name = 'Sikwanda T.', headline = 'Product Designer', looking_for = 'Freelance Projects', social_platform = 'instagram', social_handle = 'sikwandat' where id = '00000000-0000-4000-8000-000000000004';
update public.profiles set display_name = 'Natasha P.', headline = 'Marketing Director', looking_for = 'Growth Hackers', social_platform = 'instagram', social_handle = 'natashap' where id = '00000000-0000-4000-8000-000000000005';
update public.profiles set display_name = 'Mwila K.', headline = '', looking_for = '', social_platform = 'instagram', social_handle = 'mwilak' where id = '00000000-0000-4000-8000-000000000006';
update public.profiles set display_name = 'Chanda M.', headline = 'DJ / Music Producer', looking_for = 'Party Enthusiasts', social_platform = 'instagram', social_handle = 'chandam' where id = '00000000-0000-4000-8000-000000000007';
update public.profiles set display_name = 'Sepo L.', headline = 'Event Manager', looking_for = 'Sponsors & VIPs', social_platform = 'instagram', social_handle = 'sepol' where id = '00000000-0000-4000-8000-000000000008';
update public.profiles set display_name = 'Mapalo S.', headline = '', looking_for = '', social_platform = 'instagram', social_handle = 'mapalos' where id = '00000000-0000-4000-8000-000000000009';
update public.profiles set display_name = 'Luyando M.', headline = 'Visual Artist', looking_for = 'Galleries & Collaborators', social_platform = 'instagram', social_handle = 'luyandom' where id = '00000000-0000-4000-8000-000000000010';
update public.profiles set display_name = 'Bwembya N.', headline = 'Fashion Designer', looking_for = 'Models & Photographers', social_platform = 'instagram', social_handle = 'bwembyan' where id = '00000000-0000-4000-8000-000000000011';
update public.profiles set display_name = 'Victor H.', headline = 'Real Estate Investor', looking_for = 'Execs & Angel Investors', social_platform = 'instagram', social_handle = 'victorh' where id = '00000000-0000-4000-8000-000000000012';
update public.profiles set display_name = 'Kondwani B.', headline = 'Corporate Attorney', looking_for = 'Business Partners', social_platform = 'instagram', social_handle = 'kondwanib' where id = '00000000-0000-4000-8000-000000000013';
update public.profiles set display_name = 'Natasha B.', headline = '', looking_for = '', social_platform = 'instagram', social_handle = 'natashab' where id = '00000000-0000-4000-8000-000000000014';
update public.profiles set display_name = 'Mwamba J.', headline = 'Fitness Trainer', looking_for = 'Good Vibes', social_platform = 'instagram', social_handle = 'mwambaj' where id = '00000000-0000-4000-8000-000000000015';
update public.profiles set display_name = 'Mutale C.', headline = '', looking_for = '', social_platform = 'instagram', social_handle = 'mutalec' where id = '00000000-0000-4000-8000-000000000016';
update public.profiles set display_name = 'Chisala R.', headline = 'Mining Engineer', looking_for = 'Tech Consultants', social_platform = 'instagram', social_handle = 'chisalar' where id = '00000000-0000-4000-8000-000000000017';

insert into public.events (id, host_id, name, category, status, starts_on, start_time,
  city, area, vibe, dress_code, description, image_url, host_display_name, organization,
  ticket_price_ngwee, vibe_score) values
  ('00000000-0000-4000-9000-000000000001', '00000000-0000-4000-8000-000000000001', 'Lusaka Tech & Founders Mixer', 'tech_business', 'published', '2026-03-20', '18:00', 'Lusaka', 'Kabulonga, Lusaka', 'Tech & Business', 'Smart Casual', 'Connect with Zambian tech founders, investors, software engineers, and product designers. Pitch ideas, find co-founders, and sip craft cocktails.', 'https://images.unsplash.com/photo-1511578314322-379afb476865?w=600&h=400&fit=crop', 'Bwalya M.', 'Zed Tech Hub', 15000, 94),
  ('00000000-0000-4000-9000-000000000002', '00000000-0000-4000-8000-000000000006', 'Neon Nights Afrobeats Gala', 'party', 'published', '2026-03-21', '20:00', 'Lusaka', 'Kabulonga, Lusaka', 'Afrobeats & Amapiano', 'All White Glow', 'The biggest all-white party Lusaka has ever seen. Expect top-tier DJs, guest performances, premium drinks, and vibes till sunrise.', 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&h=400&fit=crop', 'Mwila K.', null, 20000, 98),
  ('00000000-0000-4000-9000-000000000003', '00000000-0000-4000-8000-000000000009', 'Creative Hub: Art, Beats & Drinks', 'creative_arts', 'published', '2026-03-25', '17:00', 'Lusaka', 'Longacres, Lusaka', 'Creative & Arts', 'Boho Chic', 'Live painting, acoustic sessions, local fashion showcases, and relaxed networking for creators, filmmakers, and digital artists.', 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=600&h=400&fit=crop', 'Mapalo S.', null, 10000, 91),
  ('00000000-0000-4000-9000-000000000004', '00000000-0000-4000-8000-000000000012', 'VIP Sky Lounge & Cigar Night', 'vip_lounge', 'published', '2026-04-02', '19:30', 'Lusaka', 'Roma, Lusaka', 'VIP Lounge', 'Formal / Black Tie', 'An exclusive rooftop gathering featuring single malt whiskeys, fine cigars, live jazz, and high-net-worth networking.', 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=600&h=400&fit=crop', 'Victor H.', null, 50000, 95),
  ('00000000-0000-4000-9000-000000000005', '00000000-0000-4000-8000-000000000014', 'Sunkissed Pool Party & Sunset Vibes', 'party', 'published', '2026-04-04', '12:00', 'Lusaka', 'Ibex Hill, Lusaka', 'Pool Party', 'Swimwear & Shades', 'Inflatables, signature cocktails, food trucks, and daytime energy with DJ Kez on the decks.', 'https://images.unsplash.com/photo-1504196606672-aef5c9cefc92?w=600&h=400&fit=crop', 'Natasha B.', null, 12000, 93),
  ('00000000-0000-4000-9000-000000000006', '00000000-0000-4000-8000-000000000016', 'Copperbelt Innovators & Enterprise Meetup', 'tech_business', 'published', '2026-04-10', '17:30', 'Ndola', 'Kansenshi, Ndola', 'Business & Mining Tech', 'Business Casual', 'Bringing together Copperbelt entrepreneurs, mining tech innovators, and business leaders for an evening of talks and networking.', 'https://images.unsplash.com/photo-1496024840928-4c417adf211d?w=600&h=400&fit=crop', 'Mutale C.', null, 0, 89);

-- Exact address and host contact: approved guests and ticket holders only.
insert into public.event_private (event_id, full_address, latitude, longitude, host_whatsapp) values ('00000000-0000-4000-9000-000000000001', 'The Innovation Hub, Kabulonga Rd, Lusaka', -15.421, 28.328, '+260971112233');
insert into public.event_private (event_id, full_address, latitude, longitude, host_whatsapp) values ('00000000-0000-4000-9000-000000000002', 'Plot 2314, Kabulonga Rd, Lusaka', -15.418, 28.335, '+260971234567');
insert into public.event_private (event_id, full_address, latitude, longitude, host_whatsapp) values ('00000000-0000-4000-9000-000000000003', '72 Longacres Art Collective, off Independence Ave', -15.412, 28.309, '+260974445566');
insert into public.event_private (event_id, full_address, latitude, longitude, host_whatsapp) values ('00000000-0000-4000-9000-000000000004', '45 Leopards Hill Close, Roma Park Sky Deck', -15.385, 28.318, '+260975556677');
insert into public.event_private (event_id, full_address, latitude, longitude, host_whatsapp) values ('00000000-0000-4000-9000-000000000005', '12 Ibex Hill Estate, House 7B, Lusaka', -15.402, 28.365, '+260973456789');
insert into public.event_private (event_id, full_address, latitude, longitude, host_whatsapp) values ('00000000-0000-4000-9000-000000000006', 'President Ave Convention Hall, Ndola', -12.969, 28.636, '+260978901234');

-- Attendees, opted in and featured by the host, so the public "Attending this
-- event" section has content. events.rsvp_count is maintained by trigger.
insert into public.event_rsvps (event_id, user_id, show_publicly, featured_by_host) values ('00000000-0000-4000-9000-000000000001', '00000000-0000-4000-8000-000000000002', true, true);
insert into public.event_rsvps (event_id, user_id, show_publicly, featured_by_host) values ('00000000-0000-4000-9000-000000000001', '00000000-0000-4000-8000-000000000003', true, true);
insert into public.event_rsvps (event_id, user_id, show_publicly, featured_by_host) values ('00000000-0000-4000-9000-000000000001', '00000000-0000-4000-8000-000000000004', true, true);
insert into public.event_rsvps (event_id, user_id, show_publicly, featured_by_host) values ('00000000-0000-4000-9000-000000000001', '00000000-0000-4000-8000-000000000005', true, true);
insert into public.event_rsvps (event_id, user_id, show_publicly, featured_by_host) values ('00000000-0000-4000-9000-000000000002', '00000000-0000-4000-8000-000000000007', true, true);
insert into public.event_rsvps (event_id, user_id, show_publicly, featured_by_host) values ('00000000-0000-4000-9000-000000000002', '00000000-0000-4000-8000-000000000008', true, true);
insert into public.event_rsvps (event_id, user_id, show_publicly, featured_by_host) values ('00000000-0000-4000-9000-000000000003', '00000000-0000-4000-8000-000000000010', true, true);
insert into public.event_rsvps (event_id, user_id, show_publicly, featured_by_host) values ('00000000-0000-4000-9000-000000000003', '00000000-0000-4000-8000-000000000011', true, true);
insert into public.event_rsvps (event_id, user_id, show_publicly, featured_by_host) values ('00000000-0000-4000-9000-000000000004', '00000000-0000-4000-8000-000000000012', true, true);
insert into public.event_rsvps (event_id, user_id, show_publicly, featured_by_host) values ('00000000-0000-4000-9000-000000000004', '00000000-0000-4000-8000-000000000013', true, true);
insert into public.event_rsvps (event_id, user_id, show_publicly, featured_by_host) values ('00000000-0000-4000-9000-000000000005', '00000000-0000-4000-8000-000000000015', true, true);
insert into public.event_rsvps (event_id, user_id, show_publicly, featured_by_host) values ('00000000-0000-4000-9000-000000000006', '00000000-0000-4000-8000-000000000017', true, true);

-- Facecard requests, so the host dashboard has something to decide on.
insert into public.guest_requests (event_id, user_id, status, reason) values ('00000000-0000-4000-9000-000000000004', '00000000-0000-4000-8000-000000000003', 'pending', 'Looking to connect with fintech angel investors and pitch our mobile payment solution.') on conflict (event_id, user_id) do nothing;
insert into public.guest_requests (event_id, user_id, status, reason) values ('00000000-0000-4000-9000-000000000001', '00000000-0000-4000-8000-000000000008', 'approved', 'Co-hosting the upcoming Lusaka Design Summit and seeking event sponsors.') on conflict (event_id, user_id) do nothing;

