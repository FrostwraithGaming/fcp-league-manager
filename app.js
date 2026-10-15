const SUPABASE_URL = "https://ekfziidavohcdzbypocn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_G5kYPFWCVtU4NwNZ5JgofQ_6yJkGfoO";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = (id) => document.getElementById(id);
const tbody = $("membersBody");
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
  $("accountLabel").textContent = user ? user.email : "";
  $("statusLabel").innerHTML = user ? "<i></i> Database connected" : "<i></i> Sign in required";
}
function statusFor(m) {
  const elapsed = (Date.now() - new Date(m.joined_at).getTime()) / 3600000;
  if ((m.last_points || 0) >= 500) return ["Onboarding target met", "good"];
  if (elapsed >= 2) return ["Needs review", "bad"];
  return ["Within 2-hour window", ""];
}
function render() {
  $("memberCount").textContent = members.length;
  if (!members.length) {
    tbody.innerHTML = '<tr class="empty"><td colspan="5">No saved members yet. Add your first member above.</td></tr>';
    return;
  }
  tbody.innerHTML = members.map(m => {
    const [label, cls] = statusFor(m);
    return '<tr><td><strong>' + safe(m.player_name) + '</strong></td><td>' +
      safe(new Date(m.joined_at).toLocaleString()) + '</td><td>' +
      safe(m.last_points || 0) + ' AP</td><td><span class="status-text ' + cls + '">' +
      label + '</span></td><td><button class="tiny" data-points="' + m.id + '">Update AP</button></td></tr>';
  }).join("");
}
async function loadMembers() {
  const { data, error } = await db.from("league_members").select("*").neq("status", "removed").order("joined_at", {ascending:false});
  if (error) throw error;
  members = data || [];
  render();
}
async function refreshSession() {
  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  setSignedIn(data.session?.user || null);
  if (data.session?.user) {
    try { await loadMembers(); showMessage(""); }
    catch (e) { showMessage("Database access is not ready yet. Run the setup SQL shown in the project instructions. Details: " + e.message, true); }
  }
}
$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("loginButton");
  button.disabled = true; button.textContent = "Signing in…";
  const { error } = await db.auth.signInWithPassword({email:$("email").value.trim(), password:$("password").value});
  button.disabled = false; button.textContent = "Sign in";
  if (error) showMessage(error.message, true);
  else { showMessage(""); await refreshSession(); }
});
$("signOut").addEventListener("click", async () => {
  await db.auth.signOut();
  members = []; render(); setSignedIn(null); showMessage("Signed out.");
});
$("addMemberForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("playerName").value.trim();
  if (!name) return;
  const { data, error } = await db.from("league_members").insert({
    player_name: name, initial_points: 0, last_points: 0, status: "pending"
  }).select().single();
  if (error) { showMessage(error.message, true); return; }
  await db.from("activity_history").insert({member_id:data.id, activity_points:0});
  $("playerName").value = "";
  await loadMembers();
  showMessage("Member saved. AP updates must currently be entered manually.");
});
tbody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-points]");
  if (!button) return;
  const member = members.find(m => String(m.id) === button.dataset.points);
  if (!member) return;
  const raw = prompt("Enter the member's current total activity points (AP):", String(member.last_points || 0));
  if (raw === null) return;
  const points = Number(raw);
  if (!Number.isInteger(points) || points < 0) { showMessage("Enter a whole number of 0 or more.", true); return; }
  const nextStatus = points >= 500 ? "active" : (Date.now() >= new Date(member.initial_deadline).getTime() ? "review" : "pending");
  const { error } = await db.from("league_members").update({
    last_points: points, last_checked_at: new Date().toISOString(), status: nextStatus
  }).eq("id", member.id);
  if (error) { showMessage(error.message, true); return; }
  const { error: historyError } = await db.from("activity_history").insert({member_id:member.id, activity_points:points});
  if (historyError) { showMessage("Member updated, but activity history could not be saved: " + historyError.message, true); }
  else showMessage("AP updated. This records your manual check; it does not read FC Mobile automatically.");
  await loadMembers();
});
db.auth.onAuthStateChange((_event, session) => {
  setSignedIn(session?.user || null);
});
refreshSession().catch(e => showMessage(e.message, true));
