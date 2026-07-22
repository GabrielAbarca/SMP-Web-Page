// ─────────────────────────────────────────────────────────────────
//  accounts.js — login-account management for the admin console.
//
//  Real mode: calls the `admin-users` Edge Function (service role) to
//  create login accounts, reset passwords and (de)activate them.
//  Demo mode: never calls the function — it returns a simulated result
//  so the public demo can show the flow without minting real users.
// ─────────────────────────────────────────────────────────────────

import { supabase } from "./supabaseClient.js";
import { DEMO_MODE } from "./demoMode.js";

/** Pull a human message out of a functions.invoke error or data.error. */
async function unwrap(error, data) {
  if (data && data.error) throw new Error(String(data.error));
  if (!error) return;
  // FunctionsHttpError carries the Response in `context`.
  try {
    const body = await error.context?.json?.();
    if (body?.error) throw new Error(String(body.error));
  } catch {
    /* fall through to the generic message */
  }
  throw new Error(error.message ?? "Account service error");
}

/**
 * Create a login account and link it to a teacher/student record.
 * @param {{ email: string, password: string, role: "teacher"|"student"|"admin",
 *   name?: string, linkType?: "teacher"|"student", linkId?: number }} params
 */
export async function createAccount(params) {
  if (DEMO_MODE) return { simulated: true, email: params.email };
  const { data, error } = await supabase.functions.invoke("admin-users", {
    body: { action: "create", ...params },
  });
  await unwrap(error, data);
  return data;
}

/** Send a password-reset (recovery) for an existing login. */
export async function resetPassword(email) {
  if (DEMO_MODE) return { simulated: true };
  const { data, error } = await supabase.functions.invoke("admin-users", {
    body: { action: "reset", email },
  });
  await unwrap(error, data);
  return data;
}

/** Enable or disable sign-in for a login. */
export async function setAccountActive(userId, active) {
  if (DEMO_MODE) return { simulated: true };
  const { data, error } = await supabase.functions.invoke("admin-users", {
    body: { action: "setActive", userId, active },
  });
  await unwrap(error, data);
  return data;
}

/** A reasonable temporary password to prefill the create form. */
export function generateTempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#%";
  let out = "";
  const rand = new Uint32Array(12);
  crypto.getRandomValues(rand);
  for (let i = 0; i < 12; i++) out += chars[rand[i] % chars.length];
  return out;
}
