# Account & password recovery

Who fixes a forgotten password, and how — without the developer.

That last part is the point. A school that has to message us because a teacher
forgot their password on a Monday morning does not have a working system. Every
routine case below is handled by the school's own administrator or by the user
themselves.

| Situation                                 | Who fixes it         | Where                              |
| ----------------------------------------- | -------------------- | ---------------------------------- |
| Anyone forgets their password             | Themselves           | Login page → **Forgot password?**  |
| A user cannot receive the email           | School administrator | Admin console → **Reset password** |
| A user wants to change a working password | Themselves           | Settings → Login security          |
| A new hire has no login yet               | School administrator | Admin console → **Create login**   |
| Someone leaves                            | School administrator | Deactivate the record (see §5)     |
| **The only administrator is locked out**  | Operator (you)       | Supabase dashboard (§4)            |

---

## 1. Self-service: "Forgot password?"

On the login page, **Forgot password?** sends a recovery email to the address
entered.

The confirmation is deliberately neutral — it says an email has been sent
whether or not the address has an account. That is intentional: a message like
"no such user" turns the login form into a way to discover who attends the
school.

The emailed link returns to `/login.html`, which recognises it and asks for a
new password. Both link formats are handled: the `#access_token` form and the
`?token_hash` form. The second matters because corporate mail scanners follow
links before the recipient does, and the first format is consumed when they do
— configure the `{{ .TokenHash }}` email template (runbook §5) if a school
reports links that are "already expired" on first click.

**This depends on Auth URL configuration** (runbook §5). Without the Site URL
and redirect allow-list, the link lands on the dashboard instead of the
recovery form, and the token is spent. It is per project and is not restored
from a database dump — check it after any restore.

Not available in demo mode: the shared demo account's password is public by
design and must stay put.

---

## 2. Administrator-driven reset

Admin console → **Teachers** or **Students** → the account button on the row.

- **Reset password** (on a row that already has a login) sends the same
  recovery email as §1. Use it when the user cannot find the email or is not
  sure which address the account uses.
- **Create login** (on a row with no login) creates the account with a
  generated temporary password to hand over. The user changes it afterwards
  in Settings (§3).

Both run through the `admin-users` Edge Function, which verifies the caller is
an admin before doing anything and holds the service-role key server-side. It
never reaches the browser.

**An administrator cannot read anyone's password.** Passwords are stored hashed
by Supabase Auth. Resetting is the only option available to anyone, which is
the correct answer to "can you just tell me my password?".

In demo mode both actions are simulated: the console shows the result, and no
account is created or altered anywhere.

---

## 3. Changing a password you still know

Settings → Login security → **Change password**, for any signed-in user. Enter
the new password twice.

Use this after receiving a temporary password from an administrator.

If the response asks you to sign in again, the session is older than Supabase
allows for a credential change — sign out, sign back in, and repeat, or use the
forgot-password flow in §1. Disabled in demo mode.

---

## 4. When the only administrator is locked out

This is the one case that needs the operator, because there is nobody left with
permission inside the app.

1. Supabase Dashboard → Authentication → Users → find the account →
   **Send recovery email** (or set a password directly).
2. If the account is gone entirely, recreate it and restore its role:

   ```sql
   update public.profiles set role = 'admin' where id = '<auth-user-uuid>';
   ```

   Run it from the dashboard SQL editor. It works from there and only from
   there: a trigger blocks role changes made with the browser's anon key, so
   this cannot be done by a signed-in user (see
   `supabase/schema/incremental_profile_role_guard.sql` — without that trigger
   any student could make themselves an administrator).

**Prevent the situation instead:** every school should have **two**
administrator accounts from day one, ideally on different email domains. Make
it part of onboarding.

---

## 5. Removing access

Two different things, often confused:

- **Deactivate the record** (admin console) flips the person's `status` to
  inactive. They stop appearing in active lists. **Their login still works.**
- **Disable the login** blocks sign-in. Available through the Edge Function's
  `setActive` action; there is no button for it yet.

When someone leaves, deactivating the record alone is not enough — their
account can still sign in and read what their role allows. Until the UI exists,
disable the login from the dashboard: Authentication → Users → the account →
ban, or delete it.

> **Known gap.** `setActive` is implemented in the Edge Function
> (`supabase/functions/admin-users/index.ts`) and in the client
> (`src/js/accounts.js`) but nothing calls it. Wiring a deactivate-login
> control into the admin console is a worthwhile follow-up: leavers are a
> routine event and this is the one part of the flow that still needs the
> dashboard.

---

## 6. Why demo mode can still verify a recovery token

`auth.js` gates every recovery action in demo mode except `verifyRecoveryToken`,
which is the one call that can change server state while the demo is on —
verifying a token consumes it.

That is accepted rather than overlooked. The login page needs the result to
tell an expired link from a usable one; gating it would leave a visitor at a
form that cannot say why it fails. And it is unreachable in practice: demo mode
refuses to request a recovery email at all, so no valid token for the demo
project can exist, and a token from a school project is meaningless against the
demo project's endpoint.

---

## Related

- [ONBOARDING_RUNBOOK.md](ONBOARDING_RUNBOOK.md) — §5 Auth URL configuration,
  which both recovery flows depend on
- [BACKUP_RESTORE.md](BACKUP_RESTORE.md) — recovery of the data itself
