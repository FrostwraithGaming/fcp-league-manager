const SUPABASE_URL = "https://ekfziidavohcdzbypocn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_G5kYPFWCVtU4NwNZ5JgofQ_6yJkGfoO";
const $ = (id) => document.getElementById(id);
let db = null;
let allMembers = [];
let members = [];
let allHistory = [];
let allAlerts = [];
let allSnapshots = [];
let allActions = [];
let ocrDrafts = [];
let rawOcrText = "";

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
function normalizedName(value) {
  return String(value || "").toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}
function statusFor(m) {
  if (m.status === "removed") return ["Removed", "bad"];
  const earned = Math.max(0, Number(m.last_points || 0) - Number(m.initial_points || 0));
  if (m.status === "active") return earned >= 500 ? ["Onboarding target met", "good"] : ["Active / baseline", "good"];
  if (earned >= 500) return ["Onboarding target met", "good"];
  const deadline = new Date(m.initial_deadline || (new Date(m.joined_at).getTime() + 2 * 3600000)).getTime();
  if (Number.isFinite(deadline) && Date.now() >= deadline) return ["Needs review", "bad"];
  return ["Within 2-hour window", ""];
}
function indiaWeekStart(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now);
  const p = Object.fromEntries(parts.map(item => [item.type, item.value]));
  const date = p.year + "-" + p.month + "-" + p.day;
  const midnight = new Date(date + "T00:00:00+05:30");
  const day = new Date(date + "T00:00:00Z").getUTCDay();
  midnight.setTime(midnight.getTime() - ((day + 6) % 7) * 86400000);
  return midnight;
}
function weeklyPointsFor(memberId) {
  const weekStart = indiaWeekStart().getTime();
  const rows = allHistory.filter(h => String(h.member_id) === String(memberId))
    .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at) || Number(a.id) - Number(b.id));
  const before = rows.filter(h => new Date(h.recorded_at).getTime() <= weekStart);
  const baseline = before[before.length - 1];
  if (!baseline) return null;
  const baselineTime = new Date(baseline.recorded_at).getTime();
  if (weekStart - baselineTime > 8 * 86400000) return null;
  const weekRows = rows.filter(h => {
    const t = new Date(h.recorded_at).getTime();
    return t > weekStart && t <= Date.now();
  });
  if (!weekRows.length) return null;
  let previous = Number(baseline.activity_points || 0);
  let earned = 0;
  for (const row of weekRows) {
    const points = Math.max(0, Number(row.activity_points || 0));
    earned += points >= previous ? points - previous : points;
    previous = points;
  }
  return earned;
}
function render() {
  const tbody = $("membersBody");
  if ($("memberCount")) $("memberCount").textContent = members.length;
  if ($("openAlertCount")) $("openAlertCount").textContent = allAlerts.filter(a => !a.read_at).length;
  if (!tbody) return;
  if (!members.length) {
    tbody.innerHTML = '<tr class="empty"><td colspan="6">No saved members yet. Add a member or import a roster screenshot.</td></tr>';
    return;
  }
  tbody.innerHTML = members.map(m => {
    const [label, cls] = statusFor(m);
    const weekly = weeklyPointsFor(m.id);
    const weeklyLabel = weekly === null ? "Awaiting snapshot" : weekly.toLocaleString() + " AP";
    const weeklyClass = weekly === null ? "" : (weekly >= 1500 ? "good" : "");
    return '<tr><td><strong>' + safe(m.player_name) + '</strong></td><td>' +
      safe(new Date(m.joined_at).toLocaleString()) + '</td><td>' +
      safe(m.last_points ?? 0) + ' AP</td><td><span class="status-text ' + weeklyClass + '">' +
      safe(weeklyLabel) + '</span></td><td><span class="status-text ' + cls + '">' +
      label + '</span></td><td><button class="tiny" type="button" data-points="' + Number(m.id) + '">Update AP</button></td></tr>';
  }).join("");
}
function renderAlerts() {
  const tbody = $("alertsBody");
  if (!tbody) return;
  if (!allAlerts.length) {
    tbody.innerHTML = '<tr class="empty"><td colspan="4">No alerts yet. Scheduled checks will add alerts here when a rule needs attention.</td></tr>';
    return;
  }
  tbody.innerHTML = allAlerts.map(alert => {
    const member = allMembers.find(m => String(m.id) === String(alert.member_id));
    const state = alert.read_at ? "Read" : "Unread";
    const type = alert.alert_type === "onboarding_shortfall" ? "Onboarding" :
      alert.alert_type === "weekly_shortfall" ? "Weekly target" : "Data coverage";
    return '<tr><td>' + safe(new Date(alert.created_at).toLocaleString()) + '</td><td><strong>' +
      safe(alert.title) + '</strong><div class="alert-type">' + safe(type) + '</div></td><td>' +
      safe(member?.player_name || "League member") + '</td><td><span class="status-text ' +
      (alert.read_at ? "" : "bad") + '">' + state + '</span> ' +
      (alert.read_at ? "" : '<button class="tiny" type="button" data-alert-read="' + Number(alert.id) + '">Mark read</button>') + '</td></tr>';
  }).join("");
}

function renderSnapshots() {
  const tbody = $("snapshotsBody");
  if (!tbody) return;
  if (!allSnapshots.length) {
    tbody.innerHTML = '<tr class="empty"><td colspan="6">No screenshot roster snapshots have been saved yet.</td></tr>';
    return;
  }
  tbody.innerHTML = allSnapshots.map(snapshot => {
    const source = snapshot.source === "reviewed_screenshot_ocr" ? "Reviewed screenshots" : "Manual entry";
    const status = snapshot.status === "complete" ? "Complete" : snapshot.status === "partial" ? "Partial" :
      snapshot.status === "failed" ? "Failed" : "Processing";
    const statusClass = snapshot.status === "complete" ? "good" : snapshot.status === "failed" ? "bad" : "";
    return '<tr><td>' + safe(new Date(snapshot.scanned_at).toLocaleString()) + '</td><td>' + safe(source) +
      '</td><td>' + safe(snapshot.detected_rows) + '</td><td>' + safe(snapshot.saved_rows) +
      '</td><td>' + safe(snapshot.skipped_rows) + '</td><td><span class="status-text ' + statusClass + '">' +
      safe(status) + ' · ' + safe(snapshot.failed_rows) + ' failed</span></td></tr>';
  }).join("");
}
function renderActionReviews() {
  const tbody = $("actionReviewsBody");
  if (!tbody) return;
  if (!allActions.length) {
    tbody.innerHTML = '<tr class="empty"><td colspan="5">No removal recommendations are awaiting review. Shortfall alerts may create recommendations when verified snapshot data shows a target was missed.</td></tr>';
    return;
  }
  tbody.innerHTML = allActions.map(action => {
    const member = allMembers.find(m => String(m.id) === String(action.member_id));
    const stateLabel = action.status === "pending" ? "Pending review" :
      action.status === "approved" ? "Approved for manual action" :
      action.status === "declined" ? "Declined" : "Completed manually";
    let controls = "";
    if (action.status === "pending") {
      controls = '<div class="action-buttons"><button class="tiny" type="button" data-action-decision="' +
        Number(action.id) + '" data-decision="approve">Approve manual removal</button><button class="tiny" type="button" data-action-decision="' +
        Number(action.id) + '" data-decision="decline">Decline</button></div>';
    } else if (action.status === "approved") {
      controls = '<button class="tiny" type="button" data-action-complete="' + Number(action.id) +
        '">Confirm removed in game</button>';
    } else if (action.status === "completed" && action.completion_note) {
      controls = '<div class="action-note">' + safe(action.completion_note) + '</div>';
    }
    return '<tr><td>' + safe(new Date(action.proposed_at).toLocaleString()) + '</td><td><strong>' +
      safe(member?.player_name || "League member") + '</strong><div class="alert-type">Manual removal recommendation</div></td><td>' +
      '<div class="action-reason">' + safe(action.reason) + '</div></td><td><span class="status-text ' +
      (action.status === "pending" ? "bad" : action.status === "completed" ? "good" : "") + '">' + safe(stateLabel) +
      '</span></td><td>' + controls + '</td></tr>';
  }).join("");
}

async function loadMembers() {
  const { data, error } = await db.from("league_members").select("*").order("joined_at", {ascending:false});
  if (error) throw error;
  allMembers = data || [];
  members = allMembers.filter(m => m.status !== "removed");
  const historySince = new Date(Date.now() - 16 * 86400000).toISOString();
  const [historyResult, alertResult, snapshotResult, actionResult] = await Promise.all([
    db.from("activity_history").select("id,member_id,activity_points,recorded_at")
      .gte("recorded_at", historySince).order("recorded_at", {ascending:true}),
    db.from("league_alerts").select("*").order("created_at", {ascending:false}).limit(25),
    db.from("league_roster_snapshots")
      .select("id,scanned_at,detected_rows,saved_rows,skipped_rows,failed_rows,status,source")
      .order("scanned_at", {ascending:false}).limit(12),
    db.from("league_action_reviews").select("*").order("proposed_at", {ascending:false}).limit(50)
  ]);
  if (historyResult.error) throw historyResult.error;
  if (alertResult.error) throw alertResult.error;
  if (snapshotResult.error) throw snapshotResult.error;
  if (actionResult.error) throw actionResult.error;
  allHistory = historyResult.data || [];
  allAlerts = alertResult.data || [];
  allSnapshots = snapshotResult.data || [];
  allActions = actionResult.data || [];
  render();
  renderAlerts();
  renderSnapshots();
  renderActionReviews();
}
function readableAuthError(error) {
  const message = String(error?.message || "");
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) return "Email or password is incorrect. Check the details and confirm the admin user exists in Supabase → Authentication → Users.";
  if (lower.includes("email not confirmed")) return "This account's email is not confirmed. Check Supabase → Authentication → Users.";
  if (lower.includes("failed to fetch") || lower.includes("network")) return "Could not reach Supabase. Check your connection and reload the page.";
  return message || "Sign-in failed. Please try again.";
}
async function refreshSession() {
  if (!db) return;
  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  const user = data.session?.user || null;
  setSignedIn(user);
  if (user) {
    try { await loadMembers(); showMessage(""); }
    catch (e) { showMessage("Signed in, but database access failed. Check Supabase table policies. Details: " + e.message, true); }
  }
}
function parseAP(text) {
  const normalized = String(text || "").trim().replace(/[OoQ]/g, "0").replace(/[Il|]/g, "1");
  if (!/^[0-9][0-9,.\s]*$/.test(normalized)) return null;
  const digits = normalized.replace(/[^0-9]/g, "");
  if (!digits || digits.length > 7) return null;
  const value = Number(digits);
  return Number.isInteger(value) ? value : null;
}
function median(values) {
  if (!values.length) return 14;
  const s = [...values].sort((a,b)=>a-b);
  return s[Math.floor(s.length/2)];
}
function groupWordsIntoRows(words) {
  const usable = words.filter(w => w.text && w.bbox && Number.isFinite(w.bbox.y0) && Number.isFinite(w.bbox.y1));
  const heights = usable.map(w => Math.max(1, w.bbox.y1 - w.bbox.y0));
  const threshold = Math.max(8, Math.min(22, median(heights) * 0.8));
  const sorted = [...usable].sort((a,b)=>((a.bbox.y0+a.bbox.y1)/2)-((b.bbox.y0+b.bbox.y1)/2));
  const rows = [];
  for (const word of sorted) {
    const cy = (word.bbox.y0 + word.bbox.y1)/2;
    let row = rows.length ? rows[rows.length-1] : null;
    if (!row || Math.abs(cy-row.cy) > threshold) {
      row = {cy, words:[]};
      rows.push(row);
    }
    row.words.push(word);
    row.cy = row.words.reduce((sum,w)=>sum+(w.bbox.y0+w.bbox.y1)/2,0)/row.words.length;
  }
  return rows.map(r => r.words.sort((a,b)=>a.bbox.x0-b.bbox.x0));
}
function numericRuns(words, imageWidth) {
  const runs = [];
  for (const word of [...words].sort((a,b)=>a.bbox.x0-b.bbox.x0)) {
    const token = String(word.text || "").trim();
    if (!/^[0-9OoQIl|][0-9OoQIl|,.]*$/.test(token)) continue;
    const cleaned = token.replace(/[OoQ]/g,"0").replace(/[Il|]/g,"1");
    const digits = cleaned.replace(/[^0-9]/g,"");
    if (!digits) continue;
    const current = {text:token, value:Number(digits), bbox:word.bbox, confidence:Number(word.confidence || 0)};
    const last = runs[runs.length-1];
    const gap = last ? current.bbox.x0 - last.bbox.x1 : Infinity;
    const ygap = last ? Math.abs(((current.bbox.y0+current.bbox.y1)/2)-((last.bbox.y0+last.bbox.y1)/2)) : Infinity;
    if (last && gap >= -2 && gap < Math.max(10,imageWidth*0.014) && ygap < 12) {
      last.text += token;
      last.value = Number(last.text.replace(/[OoQ]/g,"0").replace(/[Il|]/g,"1").replace(/[^0-9]/g,""));
      last.bbox.x1 = current.bbox.x1;
      last.confidence = (last.confidence+current.confidence)/2;
    } else runs.push(current);
  }
  return runs.filter(r => r.value >= 0 && Number.isFinite(r.value));
}
function parseRecognizedRows(words, imageWidth) {
  const output = [];
  const stopWords = new Set(["ovr","rank","activity","points","ap","league","members","member","online","offline","contribution"]);
  for (const rowWords of groupWordsIntoRows(words)) {
    if (rowWords.length < 2) continue;
    const runs = numericRuns(rowWords, imageWidth);
    let apRun = runs.filter(r => r.bbox.x0 >= imageWidth*0.52).sort((a,b)=>b.bbox.x1-a.bbox.x1)[0];
    if (!apRun) apRun = runs.filter(r => r.bbox.x0 >= imageWidth*0.36).sort((a,b)=>b.bbox.x1-a.bbox.x1)[0];
    if (!apRun || apRun.value > 9999999) continue;
    const nameWords = rowWords.filter(w => {
      const t = String(w.text || "").trim();
      const x = w.bbox.x0;
      const isNumeric = /^[0-9OoQIl|][0-9OoQIl|,.]*$/.test(t);
      return !isNumeric && x >= imageWidth*0.06 && w.bbox.x1 < apRun.bbox.x0 &&
        !stopWords.has(t.toLowerCase().replace(/[^a-z]/g,""));
    });
    const name = nameWords.map(w=>String(w.text).replace(/^[^A-Za-z0-9@._-]+|[^A-Za-z0-9@._-]+$/g,"")).filter(Boolean).join(" ").replace(/\s+/g," ").trim();
    if (name.length < 2 || name.length > 45 || !/[A-Za-z]/.test(name)) continue;
    const confs = rowWords.map(w=>Number(w.confidence || 0)).filter(n=>n>0);
    const confidence = confs.length ? Math.round(confs.reduce((a,b)=>a+b,0)/confs.length) : 0;
    output.push({name, points:apRun.value, confidence});
  }
  return output;
}
function renderOCRDrafts() {
  const body = $("ocrPreviewBody");
  if (!ocrDrafts.length) {
    body.innerHTML = '<tr class="empty"><td colspan="4">No player rows could be confidently detected. Try a clearer screenshot with the whole member list visible.</td></tr>';
    $("ocrResultTitle").textContent = "No rows detected";
  } else {
    $("ocrResultTitle").textContent = ocrDrafts.length + " possible member rows";
    body.innerHTML = ocrDrafts.map((r,i) =>
      '<tr><td><input class="row-check" type="checkbox" data-select-row="' + i + '" ' + (r.selected ? "checked" : "") + ' aria-label="Select ' + safe(r.name) + '"></td>' +
      '<td><input class="ocr-edit name-edit" type="text" maxlength="80" data-edit-name="' + i + '" value="' + safe(r.name) + '" aria-label="Edit player name"></td>' +
      '<td><input class="ocr-edit ap-edit" type="number" min="0" max="9999999" step="1" data-edit-points="' + i + '" value="' + r.points + '" aria-label="Edit activity points"></td>' +
      '<td><span class="confidence">' + r.confidence + '%</span></td></tr>'
    ).join("");
  }
  updateSelectedCount();
}
function updateSelectedCount() {
  const n = ocrDrafts.filter(r=>r.selected).length;
  $("ocrSelectedCount").textContent = n + " selected";
  $("syncSelected").disabled = n === 0;
}
function readDraftEdits() {
  $("ocrPreviewBody").querySelectorAll("[data-edit-name]").forEach(el => { ocrDrafts[Number(el.dataset.editName)].name = el.value; });
  $("ocrPreviewBody").querySelectorAll("[data-edit-points]").forEach(el => { ocrDrafts[Number(el.dataset.editPoints)].points = Number(el.value); });
  $("ocrPreviewBody").querySelectorAll("[data-select-row]").forEach(el => { ocrDrafts[Number(el.dataset.selectRow)].selected = el.checked; });
  updateSelectedCount();
}
async function scanScreenshots(files) {
  if (!window.Tesseract || typeof window.Tesseract.recognize !== "function") {
    throw new Error("The OCR library didn't load. Check your internet connection and reload the website.");
  }
  const unique = new Map();
  const texts = [];
  const progressBox = $("ocrProgressBox");
  progressBox.hidden = false;
  $("ocrReview").hidden = true;
  $("ocrProgress").value = 0;
  for (let idx=0; idx<files.length; idx++) {
    const file = files[idx];
    if (!file.type.startsWith("image/")) continue;
    $("ocrStatus").textContent = "Reading screenshot " + (idx+1) + " of " + files.length + "…";
    const result = await window.Tesseract.recognize(file, "eng", {
      logger: m => {
        if (m.status === "recognizing text" && typeof m.progress === "number") {
          const p = Math.round(((idx + m.progress)/files.length)*100);
          $("ocrProgress").value = p;
          $("ocrPercent").textContent = p + "%";
          $("ocrStatus").textContent = "Reading screenshot " + (idx+1) + " of " + files.length + "…";
        } else if (m.status) {
          $("ocrStatus").textContent = m.status + " (" + (idx+1) + "/" + files.length + ")";
        }
      }
    });
    const data = result.data || {};
    texts.push(data.text || "");
    let width = data.image?.width || data.width || 0;
    if (!width) {
      const bitmap = await createImageBitmap(file);
      width = bitmap.width;
      bitmap.close?.();
    }
    const rows = parseRecognizedRows(data.words || [], width);
    for (const row of rows) {
      const key = normalizedName(row.name);
      if (!key) continue;
      const old = unique.get(key);
      if (!old || row.confidence >= old.confidence) unique.set(key, {...row, selected:true});
    }
  }
  rawOcrText = texts.join("\n\n--- next screenshot ---\n\n").slice(0,12000);
  ocrDrafts = [...unique.values()].sort((a,b)=>a.name.localeCompare(b.name));
  $("ocrRaw").textContent = rawOcrText || "(No text extracted)";
  $("ocrProgress").value = 100;
  $("ocrPercent").textContent = "100%";
  $("ocrStatus").textContent = "Scan complete";
  $("ocrReview").hidden = false;
  renderOCRDrafts();
  if (!ocrDrafts.length) {
    showMessage("OCR finished but couldn't confidently read any name/AP rows. Send me a screenshot of the league member list so I can tune the row detector.", true);
  } else {
    showMessage("Found " + ocrDrafts.length + " possible rows. Review names and AP carefully, then save selected rows.");
  }
}
async function upsertOCRRows() {
  readDraftEdits();
  const selected = ocrDrafts.filter(r => r.selected);
  if (!selected.length) {
    showMessage("Select at least one row to save.", true);
    return;
  }
  for (const row of selected) {
    if (!String(row.name || "").trim() || !Number.isInteger(Number(row.points)) ||
        Number(row.points) < 0 || Number(row.points) > 9999999) {
      showMessage("Every selected row needs a player name and a whole-number AP value.", true);
      return;
    }
  }

  const mode = $("syncMode").value;
  const button = $("syncSelected");
  button.disabled = true;
  button.textContent = "Saving snapshot…";
  let snapshotId = null;
  let created = 0, updated = 0, skipped = 0, failed = 0;
  const errors = [];
  const snapshotRows = [];
  const scannedAt = new Date().toISOString();

  try {
    const {data: userData, error: userError} = await db.auth.getUser();
    if (userError) throw userError;
    const {data: snapshot, error: snapshotError} = await db.from("league_roster_snapshots").insert({
      scanned_at: scannedAt,
      source: "reviewed_screenshot_ocr",
      uploaded_by: userData.user?.id || null,
      detected_rows: selected.length,
      status: "processing"
    }).select("id").single();
    if (snapshotError) throw snapshotError;
    snapshotId = snapshot.id;

    for (const row of selected) {
      const name = String(row.name).trim().replace(/\s+/g, " ");
      const points = Number(row.points);
      const key = normalizedName(name);
      const existing = allMembers.find(m => normalizedName(m.player_name) === key);
      let memberId = existing?.id ?? null;
      let outcome = "failed";
      let details = null;

      if (existing?.status === "removed") {
        skipped++;
        outcome = "skipped";
        details = "Already marked removed; no member record changed.";
        snapshotRows.push({snapshot_id:snapshotId,member_id:memberId,player_name:name,activity_points:points,
          ocr_confidence:Number.isFinite(Number(row.confidence)) ? Math.max(0,Math.min(100,Math.round(Number(row.confidence)))) : null,
          outcome,details});
        continue;
      }

      if (existing) {
        let nextStatus = existing.status;
        const earned = Math.max(0, points - Number(existing.initial_points || 0));
        const deadline = new Date(existing.initial_deadline || (new Date(existing.joined_at).getTime() + 7200000)).getTime();
        if (mode === "baseline") nextStatus = "active";
        else if (earned >= 500) nextStatus = "active";
        else if (nextStatus !== "active" && Date.now() >= deadline) nextStatus = "review";
        const {error} = await db.from("league_members").update({
          last_points:points,last_checked_at:scannedAt,status:nextStatus
        }).eq("id",existing.id);
        if (error) {
          failed++;
          errors.push(name + ": " + error.message);
          snapshotRows.push({snapshot_id:snapshotId,member_id:memberId,player_name:name,activity_points:points,
            ocr_confidence:Number.isFinite(Number(row.confidence)) ? Math.max(0,Math.min(100,Math.round(Number(row.confidence)))) : null,
            outcome:"failed",details:error.message});
          continue;
        }
        updated++;
        outcome = "updated";
      } else {
        const baseline = mode === "baseline";
        const {data,error} = await db.from("league_members").insert({
          player_name:name,initial_points:points,last_points:points,last_checked_at:scannedAt,
          status:baseline ? "active" : "pending"
        }).select().single();
        if (error) {
          failed++;
          errors.push(name + ": " + error.message);
          snapshotRows.push({snapshot_id:snapshotId,member_id:null,player_name:name,activity_points:points,
            ocr_confidence:Number.isFinite(Number(row.confidence)) ? Math.max(0,Math.min(100,Math.round(Number(row.confidence)))) : null,
            outcome:"failed",details:error.message});
          continue;
        }
        memberId = data.id;
        created++;
        outcome = "created";
      }

      const history = await db.from("activity_history").insert({
        member_id:memberId,activity_points:points,recorded_at:scannedAt
      });
      if (history.error) {
        failed++;
        errors.push(name + " activity history: " + history.error.message);
        outcome = "failed";
        details = "Member record saved but activity history failed: " + history.error.message;
      }
      snapshotRows.push({snapshot_id:snapshotId,member_id:memberId,player_name:name,activity_points:points,
        ocr_confidence:Number.isFinite(Number(row.confidence)) ? Math.max(0,Math.min(100,Math.round(Number(row.confidence)))) : null,
        outcome,details});
    }

    const rowInsert = await db.from("league_roster_snapshot_rows").insert(snapshotRows);
    if (rowInsert.error) errors.push("Snapshot rows: " + rowInsert.error.message);

    const savedRows = snapshotRows.filter(r => r.outcome === "created" || r.outcome === "updated").length;
    const skippedRows = snapshotRows.filter(r => r.outcome === "skipped").length;
    const failedRows = snapshotRows.filter(r => r.outcome === "failed").length + (rowInsert.error ? snapshotRows.length : 0);
    const snapshotStatus = failedRows === 0 ? "complete" : (savedRows === 0 && skippedRows === 0 ? "failed" : "partial");
    const snapshotUpdate = await db.from("league_roster_snapshots").update({
      saved_rows:savedRows,skipped_rows:skippedRows,failed_rows:failedRows,status:snapshotStatus
    }).eq("id",snapshotId);
    if (snapshotUpdate.error) errors.push("Snapshot summary: " + snapshotUpdate.error.message);

    try { await loadMembers(); } catch (e) { errors.push("Reload: " + e.message); }
  } catch (e) {
    errors.push(e?.message || String(e));
    if (snapshotId !== null) {
      try {
        await db.from("league_roster_snapshots").update({
          status:"partial",failed_rows:selected.length
        }).eq("id",snapshotId);
        await loadMembers();
      } catch (_) {}
    }
  } finally {
    button.disabled = false;
    button.innerHTML = 'Save selected to Supabase <span aria-hidden="true">→</span>';
  }

  if (snapshotId === null) {
    showMessage("Snapshot could not be started, so no AP rows were processed. Details: " + errors.slice(0,3).join(" | "), true);
  } else {
    showMessage("Roster snapshot #" + snapshotId + ": " + created + " added, " + updated + " updated, " +
      skipped + " skipped, " + failed + " row/history issue(s)." +
      (errors.length ? " Details: " + errors.slice(0,3).join(" | ") : ""));
  }
}
async function init() {
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    showMessage("The sign-in library couldn't load. Check your internet connection and reload the page.", true);
    return;
  }
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  $("loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    const button=$("loginButton"), email=$("email").value.trim(), password=$("password").value;
    if(!email || !password){showMessage("Enter both your email and password.",true);return;}
    button.disabled=true;button.innerHTML="<span>Signing in…</span><span aria-hidden=\"true\">…</span>";showMessage("");
    try{
      const {data,error}=await db.auth.signInWithPassword({email,password});
      if(error){showMessage(readableAuthError(error),true);return;}
      if(!data.session){showMessage("Supabase did not return a session. Check your admin account settings.",true);return;}
      setSignedIn(data.user||data.session.user);
      try{await loadMembers();showMessage("");}
      catch(e){showMessage("Signed in, but database access failed. Details: "+e.message,true);}
    }catch(e){showMessage(readableAuthError(e),true);}
    finally{button.disabled=false;button.innerHTML="<span>Sign in securely</span><span aria-hidden=\"true\">→</span>";}
  });
  $("signOut").addEventListener("click",async()=>{
    const {error}=await db.auth.signOut();
    if(error){showMessage("Sign-out failed: "+error.message,true);return;}
    allMembers=[];members=[];render();setSignedIn(null);showMessage("You have signed out.");
  });
  $("addMemberForm").addEventListener("submit",async event=>{
    event.preventDefault();
    const button=event.submitter||$("addMemberForm").querySelector("button"),name=$("playerName").value.trim();
    if(!name)return;
    button.disabled=true;
    try{
      const {data,error}=await db.from("league_members").insert({player_name:name,initial_points:0,last_points:0,status:"pending"}).select().single();
      if(error)throw error;
      const history=await db.from("activity_history").insert({member_id:data.id,activity_points:0});
      $("playerName").value="";await loadMembers();
      showMessage(history.error?"Member saved, but initial history failed: "+history.error.message:"Member saved. AP can be updated manually or through screenshot sync.");
    }catch(e){showMessage("Could not save the member. Details: "+e.message,true);}
    finally{button.disabled=false;}
  });

  $("actionReviewsBody").addEventListener("click", async event => {
    const decisionButton = event.target.closest("button[data-action-decision]");
    if (decisionButton) {
      const decision = decisionButton.dataset.decision;
      const actionId = Number(decisionButton.dataset.actionDecision);
      if (decision === "approve" && !window.confirm("Approve this recommendation for manual in-game removal? This website will not kick the member.")) return;
      if (decision === "decline" && !window.confirm("Decline this removal recommendation?")) return;
      decisionButton.disabled = true;
      try {
        const {error} = await db.rpc("review_league_action", {p_action_id:actionId,p_decision:decision});
        if (error) throw error;
        await loadMembers();
        showMessage(decision === "approve" ? "Approved for manual action only. No in-game action was executed." : "Recommendation declined.");
      } catch (e) {
        showMessage("Could not review this recommendation. Details: " + e.message, true);
      } finally {
        decisionButton.disabled = false;
      }
      return;
    }

    const completeButton = event.target.closest("button[data-action-complete]");
    if (!completeButton) return;
    if (!window.confirm("Only continue if you have already removed this member inside FC Mobile. The website cannot perform the kick. Confirm manually completed?")) return;
    const note = window.prompt("Record what you did in FC Mobile:", "Removed manually in FC Mobile by league admin");
    if (!note || !note.trim()) {
      showMessage("A completion note is required; the review was left approved.", true);
      return;
    }
    completeButton.disabled = true;
    try {
      const {error} = await db.rpc("complete_league_action", {
        p_action_id:Number(completeButton.dataset.actionComplete),p_note:note.trim()
      });
      if (error) throw error;
      await loadMembers();
      showMessage("Manual removal recorded. The member is now marked removed in this tracker.");
    } catch (e) {
      showMessage("Could not complete the review. Details: " + e.message, true);
    } finally {
      completeButton.disabled = false;
    }
  });

  $("alertsBody").addEventListener("click", async event => {
    const button = event.target.closest("button[data-alert-read]");
    if (!button) return;
    button.disabled = true;
    try {
      const { error } = await db.from("league_alerts").update({read_at:new Date().toISOString()}).eq("id", button.dataset.alertRead);
      if (error) throw error;
      await loadMembers();
      showMessage("Alert marked as read.");
    } catch (e) {
      showMessage("Could not update the alert. Details: " + e.message, true);
    } finally {
      button.disabled = false;
    }
  });
  const refreshButton = $("refreshDashboard");
  if (refreshButton) refreshButton.addEventListener("click", async () => {
    refreshButton.disabled = true;
    try { await loadMembers(); showMessage("Dashboard refreshed."); }
    catch (e) { showMessage("Refresh failed: " + e.message, true); }
    finally { refreshButton.disabled = false; }
  });
  $("membersBody").addEventListener("click",async event=>{
    const button=event.target.closest("button[data-points]");if(!button)return;
    const member=members.find(m=>String(m.id)===button.dataset.points);if(!member)return;
    const raw=prompt("Enter the member's current total activity points (AP):",String(member.last_points??0));
    if(raw===null)return;
    const points=Number(raw);
    if(!Number.isInteger(points)||points<0){showMessage("Enter a whole number of 0 or more.",true);return;}
    button.disabled=true;
    try{
      const earned=Math.max(0, points-Number(member.initial_points||0));
      const nextStatus=earned>=500?"active":(member.status!=="active"&&Date.now()>=new Date(member.initial_deadline || (new Date(member.joined_at).getTime()+7200000)).getTime()?"review":member.status);
      const {error}=await db.from("league_members").update({last_points:points,last_checked_at:new Date().toISOString(),status:nextStatus}).eq("id",member.id);
      if(error)throw error;
      const hist=await db.from("activity_history").insert({member_id:member.id,activity_points:points});
      await loadMembers();
      showMessage(hist.error?"AP updated, but history snapshot failed: "+hist.error.message:"AP snapshot saved. This is a manual check, not a live game reading.");
    }catch(e){showMessage("Could not save this AP update. Details: "+e.message,true);}
    finally{button.disabled=false;}
  });
  $("scanForm").addEventListener("submit",async event=>{
    event.preventDefault();
    const files=[...$("rosterImages").files];
    if(!files.length){showMessage("Choose at least one screenshot first.",true);return;}
    if(files.length>8){showMessage("Please scan up to 8 screenshots at a time.",true);return;}
    if(files.some(f=>f.size>12*1024*1024)){showMessage("Each image must be 12 MB or smaller. Try a cropped or compressed screenshot.",true);return;}
    const button=$("scanButton");button.disabled=true;button.textContent="Scanning screenshots…";showMessage("");
    try{await scanScreenshots(files);}
    catch(e){showMessage("Screenshot scan failed: "+e.message,true);$("ocrStatus").textContent="Scan failed";}
    finally{button.disabled=false;button.innerHTML="<span>Scan screenshots</span><span aria-hidden=\"true\">⌕</span>";}
  });
  $("ocrPreviewBody").addEventListener("input",event=>{
    if(event.target.matches("[data-edit-name]")) ocrDrafts[Number(event.target.dataset.editName)].name=event.target.value;
    if(event.target.matches("[data-edit-points]")) ocrDrafts[Number(event.target.dataset.editPoints)].points=Number(event.target.value);
  });
  $("ocrPreviewBody").addEventListener("change",event=>{
    if(event.target.matches("[data-select-row]")) ocrDrafts[Number(event.target.dataset.selectRow)].selected=event.target.checked;
    updateSelectedCount();
  });
  $("syncSelected").addEventListener("click",upsertOCRRows);
  $("discardScan").addEventListener("click",()=>{
    ocrDrafts=[];rawOcrText="";$("ocrReview").hidden=true;$("ocrProgressBox").hidden=true;$("rosterImages").value="";showMessage("Scan discarded.");
  });
  db.auth.onAuthStateChange((_event,session)=>setSignedIn(session?.user||null));
  await refreshSession();
}
init().catch(error=>showMessage("Startup error: "+readableAuthError(error),true));
