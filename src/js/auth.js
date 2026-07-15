import { supabase } from "./supabaseClient.js";
import { DEMO_MODE } from "./demoMode.js";

export async function signUp(name, email, password) {
  // Demo sandbox: never send the request, so visitors can't create accounts
  // on the shared backend. Mirrors the server-side "disable sign-up" Auth
  // setting; sign-in stays real.
  if (DEMO_MODE) {
    throw Object.assign(new Error("Sign-up is disabled in demo mode"), {
      name: "DemoDisabledError",
    });
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
