import type { SupabaseClient } from "@supabase/supabase-js";

/** Observe the browser SDK's automatic PKCE exchange; never exchange a code twice. */
export function observePasswordRecovery(
  auth: SupabaseClient["auth"],
  url: URL,
  onState: (state: "ready" | "invalid") => void,
  clearCallback: () => void,
) {
  let active = true;
  let verified = false;
  const hash = new URLSearchParams(url.hash.slice(1));
  const hasError = [url.searchParams, hash].some(params =>
    params.has("error") || params.has("error_code") || params.has("error_description"),
  );
  const implicitRecovery = hash.get("type") === "recovery" && hash.has("access_token");
  const finish = (state: "ready" | "invalid") => {
    if (!active) return;
    if (state === "ready") verified = true;
    clearCallback();
    onState(state);
  };

  // Subscribe before awaiting initialization. Its recovery event can precede getSession().
  const { data: { subscription } } = auth.onAuthStateChange((event, session) => {
    if (hasError) return;
    if (event === "PASSWORD_RECOVERY" && session) finish("ready");
    if (event === "SIGNED_OUT") finish("invalid");
  });

  void auth.getSession().then(({ data: { session }, error }) => {
    if (!active || verified) return;
    finish(!hasError && !error && implicitRecovery && session ? "ready" : "invalid");
  }).catch(() => {
    if (!verified) finish("invalid");
  });

  return () => {
    active = false;
    subscription.unsubscribe();
  };
}

/** Keep private callback material out of the address bar and subsequent navigation. */
export function cleanRecoveryUrl(url: URL) {
  const clean = new URL(url);
  for (const key of ["code", "type", "error", "error_code", "error_description", "flow_id"]) {
    clean.searchParams.delete(key);
  }
  clean.hash = "";
  return clean.pathname + clean.search;
}
