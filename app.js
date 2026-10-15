const SUPABASE_URL = "https://ekfziidavohcdzbypocn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_G5kYPFWCVtU4NwNZ5JgofQ_6yJkGfoO";
const $ = (id) => document.getElementById(id);
let db = null;
let members = [];

function safe(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function showMessage(message, isError = false) {
  const el = $("message");
  el.textContent = message;
  el.className = "message" + (isError ? " error" : "");
  el.hidden = !message;
}
function setSignedIn(user) {
  $("authPanel").hidden = !!user;
  $("appContent").hidden = !user;
  $("signOut").hidden = !user;
  $("accountLabel").textContent = user ? (user.email || "Admin account") : "";
  $("statusLabel").innerHTML = user
    ? '<i style="background:#7deac2;box-shadow:0 0 0 3px rgba(125,234,194,.12)"></i><span>Signed in</span>'
    : '<i></i><span>Sign in required</span>';
}
function statusFor(m) {
  const joined = new Date(m.joined_at).getTime();
  const elapsed = Number.isFinite(joined) ? (Date.now() - joined) / 3600000 : 0;
  if ((m.last_points || 0) >= 500) return ["Onboarding target met", "good"];
  if (elapsed >= 2) return ["Needs review", "bad"];
  return ["Within 2-hour window", ""];
}
function render() {
  const tbody = $("membersBody");
  if ($("memberCount")) $("memberCount").textContent = members.length;
  if (!tbody) return;
  if (!members.length) {
    tbody.innerHTML = '<tr class="empty"><td colspan="5">No saved members yet. Add your first member above.</td></tr>';
    return;
  }
  tbody.innerHTML = members.map(m => {
    const [label, cls] = statusFor(m);
    return '<tr><td><strong>' + safe(m.player_name) + '</strong></td><td>' +
      safe(new Date(m.joined_at).toLocaleString()) + '</td><td>' +
      safe(m.last_points ?? 0) + ' AP</td><td><span class="status-text ' + cls + '">' +
      label + '</span></td><td><button class="tiny" type="button" data-points="' + Number(m.id) + '">Update AP</button></td></tr>';
  }).join("");
}
async function loadMembers() {
  const { data, error } = await db.from("league_members")
    .select("*").neq("status", "removed").order("joined_at", {ascending:false});
  if (error) throw error;
  members = data || [];
  render();
}
function readableAuthError(error) {
  const message = String(error?.message || "");
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) return "Email or password is incorrect. Check the details, and confirm the admin user exists under Supabase → Authentication → Users.";
  if (lower.includes("email not confirmed")) return "This account's email is not confirmed. Open Supabase → Authentication → Users and confirm the admin user, or complete the configured confirmation process.";
  if (lower.includes("failed to fetch") || lower.includes("network")) return "Could not reach Supabase. Check your internet connection and that the Supabase project is active, then reload the page.";
  return message || "Sign-in failed. Please try again.";
}
async function refreshSession() {
  if (!db) return;
  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  const user = data.session?.user || null;
  setSignedIn(user);
  if (user) {
    try {
      await loadMembers();
      showMessage("");
    } catch (e) {
      showMessage("You're signed in, but the database tables or permissions aren't ready. Run supabase-setup.sql in the Supabase SQL Editor. Details: " + e.message, true);
    }
  }
}
async function init() {
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    showMessage("The sign-in library couldn't load. Check your internet connection, reload the page, and try again.", true);
    return;
  }
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("loginButton");
    const email = $("email").value.trim();
    const password = $("password").value;
    if (!email || !password) {
      showMessage("Enter both your email and password.", true);
      return;
    }
    button.disabled = true;
    button.innerHTML = "<span>Signing in…</span><span aria-hidden=\"true\">…</span>";
    showMessage("");
    try {
      const { data, error } = await db.auth.signInWithPassword({email, password});
      if (error) {
        showMessage(readableAuthError(error), true);
        return;
      }
      if (!data.session) {
        showMessage("Supabase did not return a session. Check the authentication settings for your admin account.", true);
        return;
      }
      setSignedIn(data.user || data.session.user);
      try {
        await loadMembers();
        showMessage("");
      } catch (dbError) {
        showMessage("Signed in successfully, but database access is not ready. Run supabase-setup.sql in Supabase → SQL Editor. Details: " + dbError.message, true);
      }
    } catch (error) {
      showMessage(readableAuthError(error), true);
    } finally {
      button.disabled = false;
      button.innerHTML = "<span>Sign in securely</span><span aria-hidden=\"true\">→</span>";
    }
  });

  $("signOut").addEventListener("click", async () => {
    if (!db) return;
    const { error } = await db.auth.signOut();
    if (error) {
      showMessage("Sign-out failed: " + error.message, true);
      return;
    }
    members = [];
    render();
    setSignedIn(null);
    showMessage("You have signed out.");
  });

  $("addMemberForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter || $("addMemberForm").querySelector("button");
    const name = $("playerName").value.trim();
    if (!name) return;
    button.disabled = true;
    try {
      const { data, error } = await db.from("league_members").insert({
        player_name: name, initial_points: 0, last_points: 0, status: "pending"
      }).select().single();
      if (error) throw error;
      const history = await db.from("activity_history").insert({member_id:data.id, activity_points:0});
      $("playerName").value = "";
      await loadMembers();
      showMessage(history.error
        ? "Member saved, but the initial activity-history entry failed: " + history.error.message
        : "Member saved. AP must currently be checked and entered manually.");
    } catch (error) {
      showMessage("Could not save the member. Check your Supabase policies and table setup. Details: " + error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  $("membersBody").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-points]");
    if (!button) return;
    const member = members.find(m => String(m.id) === button.dataset.points);
    if (!member) return;
    const raw = prompt("Enter the member's current total activity points (AP):", String(member.last_points ?? 0));
    if (raw === null) return;
    const points = Number(raw);
    if (!Number.isInteger(points) || points < 0) {
      showMessage("Enter a whole number of 0 or more.", true);
      return;
    }
    button.disabled = true;
    try {
      const nextStatus = points >= 500 ? "active" : (Date.now() >= new Date(member.initial_deadline).getTime() ? "review" : "pending");
      const { error } = await db.from("league_members").update({
        last_points: points, last_checked_at: new Date().toISOString(), status: nextStatus
      }).eq("id", member.id);
      if (error) throw error;
      const { error: historyError } = await db.from("activity_history").insert({member_id:member.id, activity_points:points});
      await loadMembers();
      showMessage(historyError
        ? "AP was updated, but the history snapshot failed: " + historyError.message
        : "AP snapshot saved. This is a manual check, not a live FC Mobile reading.");
    } catch (error) {
      showMessage("Could not save this AP update. Details: " + error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  // Keep this callback synchronous; Supabase auth callbacks should not await queries.
  db.auth.onAuthStateChange((_event, session) => {
    setSignedIn(session?.user || null);
  });
  await refreshSession();
}
init().catch(error => showMessage("Startup error: " + readableAuthError(error), true));
