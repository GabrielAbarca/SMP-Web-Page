import { supabase } from "./supabaseClient.js";
import { DEMO_MODE } from "./demoMode.js";

/**
 * Error thrown instead of contacting the backend in the demo sandbox. Callers
 * match on `name` to show a "disabled in the demo" message.
 * @param {string} message
 */
function demoDisabled(message) {
  return Object.assign(new Error(message), { name: "DemoDisabledError" });
}

export async function signUp(name, email, password) {
  // Demo sandbox: never send the request, so visitors can't create accounts
  // on the shared backend. Mirrors the server-side "disable sign-up" Auth
  // setting; sign-in stays real.
  if (DEMO_MODE) {
    throw demoDisabled("Sign-up is disabled in demo mode");
  }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
    },
  });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

/**
 * Email a password-recovery link.
 *
 * `redirectTo` must be allow-listed in the project's Auth URL configuration
 * (Site URL + additional redirect URLs) or Supabase falls back to Site URL.
 *
 * @param {string} email
 * @param {string} redirectTo where the emailed link lands — see
 *   recoveryRedirectUrl() in recovery.js
 */
export async function sendPasswordReset(email, redirectTo) {
  // Demo sandbox: the shared account's password is public by design and must
  // stay put, so no recovery mail is ever requested for it.
  if (DEMO_MODE) {
    throw demoDisabled("Password reset is disabled in demo mode");
  }
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) throw error;
}

/**
 * Exchange a recovery token hash for a session.
 *
 * Deliberately not demo-gated: this only reads the token's validity, and the
 * login page needs the result to tell an expired link from a usable one.
 *
 * @param {string} tokenHash the `token_hash` query parameter
 */
export async function verifyRecoveryToken(tokenHash) {
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "recovery",
  });
  if (error) throw error;
  return data;
}

/**
 * Set a new password for the currently authenticated user. Called at the end
 * of the recovery flow, where the recovery link supplied the session.
 * @param {string} password
 */
export async function updatePassword(password) {
  // Demo sandbox: a visitor must never be able to change the shared login.
  if (DEMO_MODE) {
    throw demoDisabled("Password changes are disabled in demo mode");
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}
