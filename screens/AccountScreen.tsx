"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabase/client";

export default function AccountScreen() {
  const search = useSearchParams();
  const tab = search.get("tab") ?? "profile";
  const { currentUser, refreshUser, resetPassword } = useAuth();
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [motion, setMotion] = useState(false);
  useEffect(() => { setName(currentUser?.name ?? ""); }, [currentUser?.name]);
  useEffect(() => { setMessage(""); setError(""); }, [tab]);
  useEffect(() => { try { setMotion(localStorage.getItem("omni-public-motion") === "paused"); } catch {} }, []);

  return <ProtectedRoute><main className="mx-auto max-w-3xl px-4 py-6">
    <Link href="/dashboard" className="text-sm underline underline-offset-4">Back to stories</Link>
    <h1 className="mt-3 text-2xl font-semibold">Your account</h1>
    <nav aria-label="Account sections" className="mt-4 flex flex-wrap gap-2">
      {([['profile','Profile'],['security','Change password'],['settings','Settings']] as const).map(([id,label]) =>
        <Link key={id} href={`/account?tab=${id}`} aria-current={tab === id ? "page" : undefined}
          className={`guest-pill ${tab === id ? "active" : ""}`}>{label}</Link>)}
    </nav>
    {error ? <p role="alert" className="mt-4 rounded-lg border border-black p-3 text-sm">{error}</p> : null}
    {message ? <p role="status" className="mt-4 text-sm">{message}</p> : null}
    <section className="mt-5 rounded-xl border border-[var(--line)] p-5">
      {tab === "security" ? <form className="space-y-4" onSubmit={async event => {
        event.preventDefault(); setMessage(""); setError("");
        const form = event.currentTarget;
        const data = new FormData(form);
        const password = String(data.get("password") || "");
        if (password !== data.get("confirm")) { setError("The passwords do not match."); return; }
        if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
          setError("Use at least 8 characters with uppercase, lowercase, a number and a symbol."); return;
        }
        setBusy(true);
        try { await resetPassword(password); form.reset(); setMessage("Password updated."); }
        catch (cause) { setError(cause instanceof Error ? cause.message : "The password could not be updated."); }
        finally { setBusy(false); }
      }}>
        <h2 className="font-semibold">Change password</h2>
        <p className="film-help">Use at least 8 characters with uppercase, lowercase, a number and a symbol.</p>
        <label className="film-decision"><span>New password</span><input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
        <label className="film-decision"><span>Confirm new password</span><input name="confirm" type="password" autoComplete="new-password" minLength={8} required /></label>
        <button type="submit" className="guest-pill active" disabled={busy}>{busy ? "Updating…" : "Update password"}</button>
      </form> : tab === "settings" ? <div>
        <h2 className="font-semibold">Playback preferences</h2>
        <label className="mt-4 flex items-center gap-3 text-sm"><input type="checkbox" checked={motion} onChange={event => {
          const paused = event.target.checked;
          setMotion(paused);
          try { localStorage.setItem("omni-public-motion", paused ? "paused" : "playing"); setMessage("Playback preference saved for this browser."); }
          catch { setError("This browser could not save the preference."); }
        }} />Pause decorative background videos</label>
        <p className="film-help">This preference is saved in this browser. Project settings stay with each story.</p>
      </div> : <form className="space-y-4" onSubmit={async event => {
        event.preventDefault(); setBusy(true); setMessage(""); setError("");
        try {
          const { error } = await createClient().auth.updateUser({ data: { full_name: name.trim() } });
          if (error) throw error;
          await refreshUser(); setMessage("Profile saved.");
        } catch (cause) { setError(cause instanceof Error ? cause.message : "The profile could not be updated."); }
        finally { setBusy(false); }
      }}>
        <h2 className="font-semibold">Profile</h2>
        <label className="film-decision"><span>Full name</span><input required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label>
        <p className="text-sm">Email: {currentUser?.email}</p>
        <button type="submit" className="guest-pill active" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
      </form>}
    </section>
  </main></ProtectedRoute>;
}
