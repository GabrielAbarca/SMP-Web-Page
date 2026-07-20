// ─────────────────────────────────────────────────────────────────
//  role.js — auth-role resolution and portal routing.
//
//  The app has one portal per profiles.role value:
//    admin   → /admin.html    (admin console — school setup & operation)
//    teacher → /teacher.html  (teacher console — classes & gradebook)
//    student → /              (student dashboard)
//  Entry points resolve the signed-in user's role with fetchRole()
//  and send strangers to their own portal via portalPath(). Roles
//  live in profiles.role (one row per auth user); a missing profile
//  row resolves to null and routes like a student (students are
//  matched by students.auth_user_id, not by profiles).
// ─────────────────────────────────────────────────────────────────

import { supabase } from "./supabaseClient.js";

/** @typedef {"admin" | "teacher" | "student"} Role */

/**
 * Resolve the signed-in user's role from their profiles row.
 * @returns {Promise<Role | null>} null when signed out, the profile row is
 *   missing, or the stored role is unknown — callers route that as "student".
 */
export async function fetchRole() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .maybeSingle();
  if (error) {
    console.error("fetchRole:", error.message);
    return null;
  }

  const role = data?.role;
  return role === "admin" || role === "teacher" || role === "student"
    ? role
    : null;
}

/**
 * Portal entry point for a role. Explicit .html paths follow the app's
 * cross-page redirect convention (Vercel's cleanUrls 308s them away).
 * @param {import("./role.js").Role | null | undefined} role
 * @returns {string}
 */
export function portalPath(role) {
  if (role === "admin") return "/admin.html";
  if (role === "teacher") return "/teacher.html";
  return "/";
}
