-- Startup Sense database schema.
-- Tables live in a private schema (not exposed through the Supabase REST API).
-- The Netlify backend talks to the database only through the SECURITY DEFINER
-- functions below, each of which requires a server-side API secret that is kept
-- in Netlify environment variables and in startup_sense.config.

create extension if not exists pgcrypto;
create schema if not exists startup_sense;
revoke all on schema startup_sense from public, anon, authenticated;

create table startup_sense.config (key text primary key, value text not null);

-- BusinessIdea records: what the user typed in.
create table startup_sense.business_ideas (
  id uuid primary key default gen_random_uuid(),
  owner_hash text not null,
  business_name text not null,
  business_idea text not null,
  business_type text,
  category text,
  city text, state text, country text,
  location text,
  latitude double precision, longitude double precision,
  geocode_source text,
  budget numeric not null,
  currency text not null default 'INR',
  expected_customers text,
  target_customer text,
  selling_price text,
  additional_info text,
  user_input jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on startup_sense.business_ideas (owner_hash, created_at desc);

-- BusinessAnalysis records: every AI run gets its own row; nothing is overwritten.
create table startup_sense.business_analyses (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references startup_sense.business_ideas(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','running','complete','failed')),
  stage text,
  stage_index int not null default 0,
  error text,
  model text,
  ai_analysis jsonb,
  score numeric(4,1),
  suppliers jsonb,
  competitors_live jsonb,
  pivots jsonb,
  jobs jsonb not null default '{}'::jsonb,
  share_token text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on startup_sense.business_analyses (idea_id, created_at desc);

create table startup_sense.rate_events (
  id bigserial primary key,
  key text not null,
  created_at timestamptz not null default now()
);
create index on startup_sense.rate_events (key, created_at desc);

alter table startup_sense.config enable row level security;
alter table startup_sense.business_ideas enable row level security;
alter table startup_sense.business_analyses enable row level security;
alter table startup_sense.rate_events enable row level security;

create or replace function startup_sense.check_secret(p_secret text) returns void
language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  select value into v from startup_sense.config where key = 'api_secret';
  if v is null or p_secret is null or v <> p_secret then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
end $$;

create or replace function startup_sense.idea_json(i startup_sense.business_ideas) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', i.id, 'businessName', i.business_name, 'businessIdea', i.business_idea,
    'businessType', i.business_type, 'category', i.category,
    'city', i.city, 'state', i.state, 'country', i.country, 'location', i.location,
    'latitude', i.latitude, 'longitude', i.longitude, 'geocodeSource', i.geocode_source,
    'budget', i.budget, 'currency', i.currency, 'expectedCustomers', i.expected_customers,
    'targetCustomer', i.target_customer, 'sellingPrice', i.selling_price,
    'additionalInfo', i.additional_info, 'userInput', i.user_input,
    'createdAt', i.created_at, 'updatedAt', i.updated_at)
$$;

create or replace function startup_sense.analysis_json(a startup_sense.business_analyses, p_full boolean) returns jsonb
language sql stable set search_path = '' as $$
  select case when a.id is null then null else
    jsonb_build_object(
      'id', a.id, 'ideaId', a.idea_id, 'status', a.status, 'stage', a.stage,
      'stageIndex', a.stage_index, 'error', a.error, 'model', a.model, 'score', a.score,
      'jobs', a.jobs, 'shareToken', a.share_token,
      'createdAt', a.created_at, 'updatedAt', a.updated_at)
    || case when p_full then jsonb_build_object(
      'aiAnalysis', a.ai_analysis, 'suppliers', a.suppliers,
      'competitorsLive', a.competitors_live, 'pivots', a.pivots) else '{}'::jsonb end
  end
$$;

create or replace function public.ss_create_idea(p_secret text, p_owner_hash text, p_idea jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_idea uuid; v_an uuid;
begin
  perform startup_sense.check_secret(p_secret);
  insert into startup_sense.business_ideas (owner_hash, business_name, business_idea, business_type, category,
    city, state, country, location, budget, currency, expected_customers, target_customer, selling_price,
    additional_info, user_input)
  values (p_owner_hash, p_idea->>'businessName', p_idea->>'businessIdea', p_idea->>'businessType', p_idea->>'category',
    p_idea->>'city', p_idea->>'state', p_idea->>'country', p_idea->>'location', (p_idea->>'budget')::numeric,
    coalesce(p_idea->>'currency','INR'), p_idea->>'expectedCustomers', p_idea->>'targetCustomer', p_idea->>'sellingPrice',
    p_idea->>'additionalInfo', p_idea)
  returning id into v_idea;
  insert into startup_sense.business_analyses (idea_id, status, stage) values (v_idea, 'queued', 'Queued')
  returning id into v_an;
  return jsonb_build_object('ideaId', v_idea, 'analysisId', v_an);
end $$;

create or replace function public.ss_start_analysis(p_secret text, p_owner_hash text, p_idea_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_an uuid;
begin
  perform startup_sense.check_secret(p_secret);
  if not exists (select 1 from startup_sense.business_ideas where id = p_idea_id and owner_hash = p_owner_hash) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into startup_sense.business_analyses (idea_id, status, stage) values (p_idea_id, 'queued', 'Queued')
  returning id into v_an;
  return jsonb_build_object('ideaId', p_idea_id, 'analysisId', v_an);
end $$;

create or replace function public.ss_patch_idea(p_secret text, p_idea_id uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform startup_sense.check_secret(p_secret);
  update startup_sense.business_ideas set
    business_name = coalesce(p_patch->>'businessName', business_name),
    business_type = coalesce(p_patch->>'businessType', business_type),
    category = coalesce(p_patch->>'category', category),
    location = coalesce(p_patch->>'location', location),
    latitude = coalesce((p_patch->>'latitude')::double precision, latitude),
    longitude = coalesce((p_patch->>'longitude')::double precision, longitude),
    geocode_source = coalesce(p_patch->>'geocodeSource', geocode_source),
    currency = coalesce(p_patch->>'currency', currency),
    updated_at = now()
  where id = p_idea_id;
end $$;

create or replace function public.ss_patch_analysis(p_secret text, p_analysis_id uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform startup_sense.check_secret(p_secret);
  update startup_sense.business_analyses set
    status = coalesce(p_patch->>'status', status),
    stage = case when p_patch ? 'stage' then p_patch->>'stage' else stage end,
    stage_index = coalesce((p_patch->>'stageIndex')::int, stage_index),
    error = case when p_patch ? 'error' then p_patch->>'error' else error end,
    model = coalesce(p_patch->>'model', model),
    ai_analysis = case when p_patch ? 'aiAnalysis' then p_patch->'aiAnalysis' else ai_analysis end,
    score = case when p_patch ? 'score' then (p_patch->>'score')::numeric else score end,
    suppliers = case when p_patch ? 'suppliers' then p_patch->'suppliers' else suppliers end,
    competitors_live = case when p_patch ? 'competitorsLive' then p_patch->'competitorsLive' else competitors_live end,
    pivots = case when p_patch ? 'pivots' then p_patch->'pivots' else pivots end,
    jobs = case when p_patch ? 'jobs' then jobs || (p_patch->'jobs') else jobs end,
    updated_at = now()
  where id = p_analysis_id;
end $$;

create or replace function public.ss_list_ideas(p_secret text, p_owner_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  perform startup_sense.check_secret(p_secret);
  select coalesce(jsonb_agg(x order by (x->>'createdAt') desc), '[]'::jsonb) into r from (
    select startup_sense.idea_json(i) - 'userInput' || jsonb_build_object('analysis',
      case when a.id is null then null else
        startup_sense.analysis_json(a, false) || jsonb_build_object(
          'verdict', a.ai_analysis->'recommendation'->>'verdict',
          'headline', a.ai_analysis->'recommendation'->>'headline') end) as x
    from startup_sense.business_ideas i
    left join lateral (select * from startup_sense.business_analyses b where b.idea_id = i.id
                       order by (b.status = 'complete') desc, b.created_at desc limit 1) a on true
    where i.owner_hash = p_owner_hash
  ) s;
  return r;
end $$;

create or replace function public.ss_get_idea(p_secret text, p_owner_hash text, p_idea_id uuid, p_analysis_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i startup_sense.business_ideas; a startup_sense.business_analyses;
begin
  perform startup_sense.check_secret(p_secret);
  select * into i from startup_sense.business_ideas where id = p_idea_id and owner_hash = p_owner_hash;
  if i.id is null then return null; end if;
  if p_analysis_id is not null then
    select * into a from startup_sense.business_analyses where id = p_analysis_id and idea_id = i.id;
  else
    select * into a from startup_sense.business_analyses where idea_id = i.id
      order by created_at desc limit 1;
  end if;
  return jsonb_build_object('idea', startup_sense.idea_json(i), 'analysis', startup_sense.analysis_json(a, true));
end $$;

create or replace function public.ss_delete_idea(p_secret text, p_owner_hash text, p_idea_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform startup_sense.check_secret(p_secret);
  delete from startup_sense.business_ideas where id = p_idea_id and owner_hash = p_owner_hash;
  return found;
end $$;

create or replace function public.ss_share(p_secret text, p_owner_hash text, p_analysis_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  perform startup_sense.check_secret(p_secret);
  select a.share_token into t from startup_sense.business_analyses a
    join startup_sense.business_ideas i on i.id = a.idea_id
    where a.id = p_analysis_id and i.owner_hash = p_owner_hash and a.status = 'complete';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if t is null then
    t := encode(extensions.gen_random_bytes(18), 'hex');
    update startup_sense.business_analyses set share_token = t where id = p_analysis_id;
  end if;
  return t;
end $$;

create or replace function public.ss_get_shared(p_secret text, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a startup_sense.business_analyses; i startup_sense.business_ideas;
begin
  perform startup_sense.check_secret(p_secret);
  select * into a from startup_sense.business_analyses where share_token = p_token and status = 'complete';
  if a.id is null then return null; end if;
  select * into i from startup_sense.business_ideas where id = a.idea_id;
  return jsonb_build_object('idea', startup_sense.idea_json(i) - 'userInput',
                            'analysis', startup_sense.analysis_json(a, true) - 'shareToken');
end $$;

create or replace function public.ss_rate_limit(p_secret text, p_key text, p_max int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform startup_sense.check_secret(p_secret);
  delete from startup_sense.rate_events where created_at < now() - interval '1 day';
  select count(*) into n from startup_sense.rate_events
    where key = p_key and created_at > now() - make_interval(secs => p_window_seconds);
  if n >= p_max then return false; end if;
  insert into startup_sense.rate_events (key) values (p_key);
  return true;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'ss_create_idea(text,text,jsonb)','ss_start_analysis(text,text,uuid)','ss_patch_idea(text,uuid,jsonb)',
    'ss_patch_analysis(text,uuid,jsonb)','ss_list_ideas(text,text)','ss_get_idea(text,text,uuid,uuid)',
    'ss_delete_idea(text,text,uuid)','ss_share(text,text,uuid)','ss_get_shared(text,text)','ss_rate_limit(text,text,int,int)']
  loop
    execute format('revoke all on function public.%s from public, authenticated', f);
    execute format('grant execute on function public.%s to anon, service_role', f);
  end loop;
end $$;
revoke all on function startup_sense.check_secret(text) from public, anon, authenticated;
revoke all on function startup_sense.idea_json(startup_sense.business_ideas) from public, anon, authenticated;
revoke all on function startup_sense.analysis_json(startup_sense.business_analyses, boolean) from public, anon, authenticated;
