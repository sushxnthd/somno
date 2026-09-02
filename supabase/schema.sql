-- Somno backend schema (Supabase / PostgreSQL).
-- Ported from Somno_03_Technical_Architecture.md §7 (data model), with §6's privacy constraint
-- enforced structurally: no table here ever stores a raw facial image or image reference — only
-- derived numeric feature vectors. Every table is scoped to auth.uid() via Row Level Security.
--
-- Apply with: supabase db push   (or paste into the SQL editor of a Supabase project)

-- ============================================================================
-- profiles (extends auth.users — Supabase Auth already provides id/email/etc.)
-- ============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  timezone text,
  age_range text,                    -- coarse range, not a birthdate (privacy: Somno_03 §6)
  gender text,                       -- optional, "prefer_not_to_say" always a valid value
  chronotype_score numeric,
  medication_flag text check (medication_flag in ('none','sedative','stimulant','antidepressant','prefer_not_to_say')) default 'none',
  onboarding_complete boolean not null default false,
  -- The rest of the model's personal factors, so a new phone scores the same way this one does.
  -- Without them a restored account looked complete and quietly ran on defaults: no stress flag, a
  -- 30-year-old's sleep target, and a sleep window nothing had set.
  --
  -- The age *band* stays a band on purpose (§6): a birthdate is not needed to pick a sleep-need
  -- target, and is not stored. The three times below are no more revealing than the nightly
  -- sleep_logs rows already are, and the debt ledger cannot be reproduced without them.
  high_stress boolean not null default false,
  usual_bedtime_min smallint,
  usual_wake_min smallint,
  natural_wake_min smallint
);

-- Existing projects: additive, and safe to re-run.
alter table public.profiles add column if not exists high_stress boolean not null default false;
alter table public.profiles add column if not exists usual_bedtime_min smallint;
alter table public.profiles add column if not exists usual_wake_min smallint;
alter table public.profiles add column if not exists natural_wake_min smallint;
-- See check_ins.updated_at: one row per account, written by every device the account is on.
alter table public.profiles add column if not exists updated_at timestamptz;

alter table public.profiles enable row level security;
create policy "profiles: owner read" on public.profiles for select using (auth.uid() = id);
create policy "profiles: owner insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles: owner update" on public.profiles for update using (auth.uid() = id);

-- ============================================================================
-- baseline_profiles (history kept as new rows on recalibration, never overwritten)
-- ============================================================================
create table if not exists public.baseline_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  pvt_mean_rt numeric not null,
  pvt_std_rt numeric not null,
  pvt_lapse_rate numeric,
  -- numeric-only facial baseline vector (EAR, periorbital idx, redness idx, MAR, skin tone) — no image
  facial_feature_baseline jsonb,
  recalibrated_at timestamptz,
  -- The rest of what a baseline *is*, without which a restored one scores differently from the
  -- baseline it was copied from. `pvt_speed` is the mean 1/RT the z-score is taken against, and the
  -- two captured_* columns are the circadian phase the measurement was made at — drop those and
  -- every later comparison silently attributes the body clock's daily swing to sleep loss.
  pvt_speed numeric,
  pvt_sessions smallint,
  captured_at_hour numeric,
  captured_hours_awake numeric
);

-- Existing projects: additive, and safe to re-run.
alter table public.baseline_profiles add column if not exists pvt_speed numeric;
alter table public.baseline_profiles add column if not exists pvt_sessions smallint;
alter table public.baseline_profiles add column if not exists captured_at_hour numeric;
alter table public.baseline_profiles add column if not exists captured_hours_awake numeric;
create index if not exists baseline_profiles_user_idx on public.baseline_profiles (user_id, created_at desc);
alter table public.baseline_profiles enable row level security;
create policy "baseline_profiles: owner all" on public.baseline_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- check_ins
-- ============================================================================
create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  "timestamp" timestamptz not null default now(),
  trigger_type text check (trigger_type in ('manual','morning','midday','evening','alarm')) not null default 'manual',
  kss_rating smallint check (kss_rating between 1 and 9),
  computed_sdi smallint not null check (computed_sdi between 0 and 100),
  confidence_level text check (confidence_level in ('high','medium','low')) not null,
  signals_used smallint not null default 0,
  -- When this row was last written by a device, in that device's clock.
  --
  -- A check-in is keyed on its instant and can be corrected afterwards, so two phones can hold
  -- different versions of the same one. Without a revision the merge could only prefer whichever
  -- device happened to be syncing, and a stale one overwrote a correction made on the other.
  updated_at timestamptz
);
alter table public.check_ins add column if not exists updated_at timestamptz;
create index if not exists check_ins_user_ts_idx on public.check_ins (user_id, "timestamp" desc);
-- A check-in IS its moment: the same user cannot have two at the same instant. This also gives
-- the client's upsert something to conflict on — without it every push fails with "no unique or
-- exclusion constraint matching the ON CONFLICT specification".
create unique index if not exists check_ins_user_ts_key on public.check_ins (user_id, "timestamp");
alter table public.check_ins enable row level security;
create policy "check_ins: owner all" on public.check_ins for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- pvt_results (1:1 with a check_in)
-- ============================================================================
create table if not exists public.pvt_results (
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null references public.check_ins(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  trial_count smallint not null,
  mean_rt numeric not null,
  median_rt numeric not null,
  lapses smallint not null default 0,
  false_starts smallint not null default 0,
  rt_cv numeric,
  time_on_task_slope numeric,
  z_score_vs_baseline numeric
);
-- One PVT result per check-in, which is what makes the client's upsert idempotent on retry.
create unique index if not exists pvt_results_checkin_idx on public.pvt_results (check_in_id);
alter table public.pvt_results enable row level security;
create policy "pvt_results: owner all" on public.pvt_results for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- facial_scan_results (numeric feature vector ONLY — never an image or image reference)
-- ============================================================================
create table if not exists public.facial_scan_results (
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null references public.check_ins(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ear_value numeric,
  periorbital_idx numeric,
  redness_idx numeric,
  mar_value numeric,
  skin_tone_delta numeric,
  perclos numeric,
  -- What the client actually measures today. Detection is Google ML Kit on-device
  -- (src/lib/faceDetect.ts), so `perclos` above is now filled from real per-eye open probabilities
  -- rather than left empty, and the photometry below (src/lib/faceFeatures.ts) is measured inside
  -- the detected box and on the detector's eye landmarks rather than over a guessed rectangle.
  -- A restore that dropped these would come back with a score it could not explain.
  -- `model_version` distinguishes the two eras: rows before 'mlkit-v1' were measured over regions
  -- found by a skin-colour rule and are not on the same scale.
  brightness numeric,
  eye_contrast numeric,     -- eye-band edge energy / face edge energy; an eyelid-opening proxy
  motion_idx numeric,       -- mean luminance change between frames; head steadiness
  stillness_ms integer,     -- how long the frame series took
  provisional boolean not null default false,  -- true while the facial baseline is too thin to score against
  z_score_vs_baseline numeric,
  model_version text not null default 'photometry-v1'
);
-- For projects applied before these columns existed; no-ops on a fresh apply.
-- The spec's feature vector (§7). ear_value/mar_value/skin_tone_delta/perclos were declared from
-- the start; these fill the gaps and make the stored row match the doc's FacialScanResult exactly.
alter table public.facial_scan_results add column if not exists mouth_corner_drop numeric;
alter table public.facial_scan_results add column if not exists periorbital_lab numeric;
alter table public.facial_scan_results add column if not exists scleral_redness numeric;
alter table public.facial_scan_results add column if not exists skin_tone_chroma numeric;
alter table public.facial_scan_results add column if not exists brightness numeric;
alter table public.facial_scan_results add column if not exists eye_contrast numeric;
alter table public.facial_scan_results add column if not exists motion_idx numeric;
alter table public.facial_scan_results add column if not exists stillness_ms integer;
alter table public.facial_scan_results add column if not exists provisional boolean not null default false;
-- One facial result per check-in, for the same reason.
create unique index if not exists facial_scan_results_checkin_idx on public.facial_scan_results (check_in_id);
alter table public.facial_scan_results enable row level security;
create policy "facial_scan_results: owner all" on public.facial_scan_results for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- sleep_logs
-- ============================================================================
create table if not exists public.sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  bedtime_min smallint not null,   -- minutes since midnight, matches app convention
  waketime_min smallint not null,
  duration_min smallint not null,
  quality text check (quality in ('Restless','Okay','Solid')),
  rest_pct smallint,
  source text check (source in ('manual','healthkit','health_connect','wearable')) not null default 'manual',
  stage_breakdown jsonb,
  -- See check_ins.updated_at. A night can legitimately be re-logged, so the same date on two
  -- devices is two versions of one record and the newer one has to be identifiable as newer.
  updated_at timestamptz
);
alter table public.sleep_logs add column if not exists updated_at timestamptz;
create index if not exists sleep_logs_user_date_idx on public.sleep_logs (user_id, date desc);
-- One night per date per user. Re-logging a night legitimately supersedes the earlier entry,
-- which is exactly the upsert the client performs.
create unique index if not exists sleep_logs_user_date_key on public.sleep_logs (user_id, date);
alter table public.sleep_logs enable row level security;
create policy "sleep_logs: owner all" on public.sleep_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- sleep_debt_records (daily semi-Markov engine snapshots — see src/engine/recovery.ts)
-- ============================================================================
create table if not exists public.sleep_debt_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  wake_debt_hours numeric not null,
  nrem_debt_hours numeric not null,
  rem_debt_hours numeric not null,
  composite_debt_score numeric not null,
  model_version text not null default 'v1'
);
create unique index if not exists sleep_debt_records_user_date_idx on public.sleep_debt_records (user_id, date);
alter table public.sleep_debt_records enable row level security;
create policy "sleep_debt_records: owner all" on public.sleep_debt_records for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- recovery_plans
-- ============================================================================
create table if not exists public.recovery_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  generated_at timestamptz not null default now(),
  recommended_bedtime_min smallint,
  recommended_nap_windows jsonb,   -- [{startMin, endMin}, ...]
  target_recovery_date date,
  status text check (status in ('active','completed','superseded')) not null default 'active'
);
create index if not exists recovery_plans_user_idx on public.recovery_plans (user_id, generated_at desc);
alter table public.recovery_plans enable row level security;
create policy "recovery_plans: owner all" on public.recovery_plans for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- alarm_configs / alarm_events
-- ============================================================================
create table if not exists public.alarm_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  time_min smallint not null,
  days_active boolean[7] not null,   -- index 0 = Monday, matches app convention
  smart_wake_enabled boolean not null default true,
  max_snoozes smallint not null default 3,
  snooze_length_min smallint not null default 7,
  escalation_enabled boolean not null default false,
  label text,
  sound text,
  is_on boolean not null default true,
  -- The app's own id for this alarm. The row's uuid is a one-way hash of it, so without this column
  -- a restored alarm could not be given back the id it had — and pushing it again would hash the
  -- new id into a different uuid and leave a duplicate behind on every restore.
  local_id bigint,
  /**
   * When this alarm was deleted, if it was. The tombstone.
   *
   * Deleting the row outright is not enough with more than one device: the second phone still holds
   * the alarm, its next push upserts it, and the alarm the user threw away is back in the account
   * and rings. A soft delete survives that, and survives it without needing the other device to
   * cooperate — the upsert lists the alarm's own columns and not this one, so a stale write updates
   * the schedule of a row that stays deleted. The pull then takes the alarm off that device.
   */
  deleted_at timestamptz,
  -- See check_ins.updated_at. An alarm's time, days, tone and switches are all editable, so the
  -- same alarm on two phones is two versions of one row and the newer one has to be identifiable.
  updated_at timestamptz
);
alter table public.alarm_configs add column if not exists local_id bigint;
alter table public.alarm_configs add column if not exists updated_at timestamptz;
alter table public.alarm_configs add column if not exists deleted_at timestamptz;
create index if not exists alarm_configs_user_idx on public.alarm_configs (user_id);
alter table public.alarm_configs enable row level security;
create policy "alarm_configs: owner all" on public.alarm_configs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.alarm_events (
  id uuid primary key default gen_random_uuid(),
  alarm_config_id uuid not null references public.alarm_configs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  fired_at timestamptz not null default now(),
  snooze_count smallint not null default 0,
  dismissed_at timestamptz,
  dismiss_method text check (dismiss_method in ('checkin_passed','checkin_snoozed_out','manual_stop')),
  check_in_id uuid references public.check_ins(id)
);
create index if not exists alarm_events_user_idx on public.alarm_events (user_id, fired_at desc);
alter table public.alarm_events enable row level security;
create policy "alarm_events: owner all" on public.alarm_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- consent_log (audit trail for compliance — never delete, only append)
-- ============================================================================
create table if not exists public.consent_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  permission_type text not null,
  granted_at timestamptz,
  revoked_at timestamptz
);
create index if not exists consent_log_user_idx on public.consent_log (user_id);
alter table public.consent_log enable row level security;
create policy "consent_log: owner read" on public.consent_log for select using (auth.uid() = user_id);
create policy "consent_log: owner insert" on public.consent_log for insert with check (auth.uid() = user_id);

-- ============================================================================
-- Auto-create a profile row when a new auth user signs up.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================================
-- Account deletion
-- ============================================================================
-- Google Play (and the App Store) require an account to be deletable from inside the app, and
-- deleting it has to mean the auth user, not merely the rows hanging off it. The client only ever
-- holds the anon key, which cannot touch auth.users — so deletion goes through this function,
-- which runs as its owner and deletes exactly one row: the caller's own.
--
-- Everything else disappears with it. Every table in this schema references auth.users(id) with
-- `on delete cascade`, so this single delete takes the profile, baselines, check-ins, PVT results,
-- facial numbers, sleep logs, alarms and the consent log with it.
--
-- The safety property that matters: the id comes from auth.uid(), never from an argument, so
-- there is no version of this call that deletes somebody else's account.
create or replace function public.delete_own_account()
returns void as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = uid;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
