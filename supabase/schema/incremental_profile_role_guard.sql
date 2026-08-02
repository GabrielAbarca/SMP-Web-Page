-- ═══════════════════════════════════════════════════════════════
--  incremental_profile_role_guard.sql
--
--  ⚠ SECURITY FIX — apply to EVERY existing project, demo included.
--
--  THE HOLE THIS CLOSES
--  school_schema.sql lets a user update their own profile:
--
--      create policy "Users can update their own profile" on public.profiles
--        for update using (auth.uid() = id);
--
--  Row-level security chooses rows, not columns, so that policy also lets
--  a user rewrite their own `role`. Any signed-in student could send
--
--      PATCH /rest/v1/profiles?id=eq.<their own uid>   {"role":"admin"}
--
--  with the anon key that ships in the browser bundle, and land as an
--  admin: is_admin() then returns true, which unlocks full read and write
--  on all 27 tables — every student's records, every grade, every
--  discipline note. One request, no credentials beyond their own login.
--
--  A column cannot be protected by a policy, so the guard is a trigger.
--  Role changes stay possible for the paths that legitimately need them:
--  an admin acting in the console, and the service-role key used by the
--  admin-users Edge Function when it provisions an account.
--
--  Already inlined in school_schema.sql for fresh projects. Apply this
--  snippet by hand to any project created before it — see
--  docs/ONBOARDING_RUNBOOK.md. Idempotent: safe to re-run.
--
--  Verify with supabase/schema/rls_audit.sql, which asserts exactly this
--  ("student cannot promote themselves to admin").
-- ═══════════════════════════════════════════════════════════════

-- SECURITY INVOKER (the default) is deliberate: the guard needs to see the
-- role the caller actually connected as. A definer function would report
-- its own owner and wave everyone through.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- Ordinary profile edits (name) are none of this trigger's business.
  if new.role is not distinct from old.role then
    return new;
  end if;

  -- The two web-facing roles are the untrusted ones: they are what a
  -- browser holding the publishable anon key arrives as. Every other role
  -- (service_role for the admin-users Edge Function, postgres for the
  -- dashboard and this file) is already trusted with the service key.
  if current_user = 'anon' then
    raise exception 'Only an administrator can change a profile role'
      using errcode = '42501';
  end if;

  if current_user = 'authenticated' and not public.is_admin() then
    raise exception 'Only an administrator can change a profile role'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Trigger functions are invoked by the system rather than called directly,
-- so no role needs EXECUTE on this one.
revoke execute on function public.protect_profile_role() from anon, authenticated, public;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();
