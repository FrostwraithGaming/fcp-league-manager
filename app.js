const SUPABASE_URL = "https://ekfziidavohcdzbypocn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_G5kYPFWCVtU4NwNZ5JgofQ_6yJkGfoO";
const TURNSTILE_SITE_KEY = "SET_CLOUDFLARE_TURNSTILE_SITE_KEY";
const $ = (id) => document.getElementById(id);
let db = null;
let currentUser = null;
let workspaces = [];
let activeWorkspaceId = null;
let allMembers = [];
let members = [];
let allHistory = [];
let allAlerts = [];
let allSnapshots = [];
let allActions = [];
let allRules = [];
let ocrDrafts = [];
let rawOcrText = "";
let captchaToken = "";
let turnstileWidgetId = null;
let initializedUserId = null;
let initializingUserId = null;
let initUserPromise = null;

function safe(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
function showMessage(message, isError = false) {
  const el = $("message");
  el.textContent = message;
  el.className = "message" + (isError ? " error" : "");
  el.hidden = !message;
  if (message) el.scrollIntoView({block:"nearest",behavior:"smooth"});
}
function setAuthVisibility(user) {
  $("authView").hidden = !!user;
  $("appView").hidden = !user;
  $("signOut").hidden = !user;
  $("userLabel").textContent = user ? (user.user_metadata?.full_name || user.email || "Signed in") : "";
  $("userEmail").textContent = user?.email || "";
  $("signedInTools").hidden = !user;
  $("signOut").hidden = !user;
}
function normalizedName(value) {
  return String(value || "").toLocaleLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}
function indiaParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"
  }).formatToParts(date);
  return Object.fromEntries(parts.map(p => [p.type,p.value]));
}
function indiaWeekStart(now = new Date()) {
  const p = indiaParts(now);
  const isoDate = p.year + "-" + p.month + "-" + p.day;
  const localMidnight = new Date(isoDate + "T00:00:00+05:30");
  const weekday = new Date(isoDate + "T00:00:00Z").getUTCDay();
  localMidnight.setTime(localMidnight.getTime() - ((weekday + 6) % 7) * 86400000);
  return localMidnight;
}
function periodStartFor(rule, now = new Date()) {
  if (!rule) return indiaWeekStart(now);
  if (rule.period_type === "weekly") return indiaWeekStart(now);
  if (rule.period_type === "monthly") {
    const p = indiaParts(now);
    return new Date(p.year + "-" + p.month + "-01T00:00:00+05:30");
  }
  if (rule.period_type === "custom") {
    const windowMs = Number(rule.duration_hours || 24) * 3600000;
    const closedWindowStart = Math.floor(now.getTime() / windowMs) * windowMs - windowMs;
    return new Date(closedWindowStart);
  }
  return indiaWeekStart(now);
}
function pointsInWindow(memberId, rule, now = new Date()) {
  const start = periodStartFor(rule, now).getTime();
  const rows = allHistory.filter(h => String(h.member_id) === String(memberId))
    .sort((a,b) => new Date(a.recorded_at)-new Date(b.recorded_at) || Number(a.id)-Number(b.id));
  const before = rows.filter(h => new Date(h.recorded_at).getTime() <= start);
  const baseline = before[before.length-1];
  if (!baseline) return null;
  const baselineAt = new Date(baseline.recorded_at).getTime();
  const maxAge = rule?.period_type === "monthly" ? 32*86400000 :
    rule?.period_type === "weekly" ? 8*86400000 : Math.max(7*86400000,Number(rule?.duration_hours||24)*2*3600000);
  if (start-baselineAt > maxAge) return null;
  const windowEnd = rule?.period_type === "custom" ? start + Number(rule.duration_hours || 24) * 3600000 : now.getTime();
  const windowRows = rows.filter(h => {
    const t = new Date(h.recorded_at).getTime();
    return t > start && t <= Math.min(now.getTime(), windowEnd);
  });
  if (!windowRows.length) return null;
  let previous = Number(baseline.activity_points || 0);
  let earned = 0;
  for (const row of windowRows) {
    const points = Math.max(0,Number(row.activity_points || 0));
    earned += points >= previous ? points-previous : points;
    previous = points;
  }
  return earned;
}
function onboardingRule() {
  return allRules.find(r => r.rule_type === "onboarding" && r.enabled) || allRules.find(r => r.rule_type === "onboarding");
}
function quotaRule() {
  return allRules.find(r => r.rule_type === "activity_quota" && r.enabled) || allRules.find(r => r.rule_type === "activity_quota");
}
function ovrRule() {
  return allRules.find(r => r.rule_type === "ovr_threshold");
}
function statusFor(member) {
  if (member.status === "removed") return ["Removed","neutral"];
  const onboarding = onboardingRule();
  const target = Number(onboarding?.target_ap ?? 500);
  const hours = Number(onboarding?.duration_hours ?? 2);
  const earned = Math.max(0,Number(member.last_points||0)-Number(member.initial_points||0));
  if (member.status === "review") return ["Needs review","bad"];
  if (member.status === "active") return earned >= target ? ["Onboarding met","good"] : ["Tracking active","good"];
  if (earned >= target) return ["Onboarding met","good"];
  const deadline = new Date(member.joined_at).getTime() + hours*3600000;
  if (Date.now() >= deadline) return ["Needs review","bad"];
  return ["Within window","neutral"];
}
function renderMetrics() {
  const activeCount = allMembers.filter(m=>m.status!=="removed").length;
  const reviewCount = allActions.filter(a=>a.status==="pending").length;
  const unread = allAlerts.filter(a=>!a.read_at).length;
  $("memberCount").textContent = activeCount;
  $("reviewCount").textContent = reviewCount;
  $("openAlertCount").textContent = unread;
  $("snapshotCount").textContent = allSnapshots.length;
}
function renderMembers() {
  const tbody = $("membersBody");
  if (!allMembers.length) {
    tbody.innerHTML = '<tr class="empty"><td colspan="7">No roster saved yet. Import a screenshot or add a member manually.</td></tr>';
    return;
  }
  tbody.innerHTML = allMembers.map(m => {
    const status = statusFor(m);
    const quota = pointsInWindow(m.id,quotaRule());
    const quotaLabel = quota === null ? "Need snapshots" : quota.toLocaleString() + " AP";
    const quotaClass = quota === null ? "neutral" : quota >= Number(quotaRule()?.target_ap||1500) ? "good" : "neutral";
    return '<tr><td><div class="player-name">' + safe(m.player_name) + '</div><div class="subtext">#' + Number(m.id) + '</div></td>' +
      '<td>' + (m.ovr ? '<span class="ovr-pill">' + safe(m.ovr) + '</span>' : '<span class="subtext">Not set</span>') +
      '<button class="link-button" type="button" data-ovr="' + Number(m.id) + '">Edit</button></td>' +
      '<td>' + safe(Number(m.last_points||0).toLocaleString()) + '</td>' +
      '<td><span class="status-pill ' + quotaClass + '">' + safe(quotaLabel) + '</span></td>' +
      '<td><span class="status-pill ' + status[1] + '">' + safe(status[0]) + '</span></td>' +
      '<td>' + safe(new Date(m.last_checked_at || m.joined_at).toLocaleString()) + '</td>' +
      '<td><button class="small-button" type="button" data-points="' + Number(m.id) + '">Update AP</button></td></tr>';
  }).join("");
}
function renderRules() {
  const onboarding = allRules.find(r=>r.rule_type==="onboarding");
  const quota = allRules.find(r=>r.rule_type==="activity_quota");
  const ovr = allRules.find(r=>r.rule_type==="ovr_threshold");
  if (onboarding) {
    $("onboardingTarget").value = onboarding.target_ap ?? 500;
    $("onboardingHours").value = onboarding.duration_hours ?? 2;
  }
  if (quota) {
    $("quotaTarget").value = quota.target_ap ?? 1500;
    $("quotaPeriod").value = quota.period_type || "weekly";
    $("quotaHours").value = quota.duration_hours ?? 24;
    $("quotaHoursField").hidden = quota.period_type !== "custom";
  }
  if (ovr) {
    $("ovrEnabled").checked = !!ovr.enabled;
    $("minimumOvr").value = ovr.minimum_ovr ?? 80;
  }
  renderMembers();
}
function renderSnapshots() {
  const tbody = $("snapshotsBody");
  if (!allSnapshots.length) {
    tbody.innerHTML = '<tr class="empty"><td colspan="5">No reviewed roster snapshot has been saved yet.</td></tr>';
    return;
  }
  tbody.innerHTML = allSnapshots.map(s => {
    const status = s.status === "complete" ? "Saved" : s.status === "partial" ? "Partial" : s.status;
    return '<tr><td>' + safe(new Date(s.scanned_at).toLocaleString()) + '</td><td>' +
      safe(s.source==="reviewed_screenshot_ocr" ? "Screenshot OCR" : "Manual entry") + '</td><td>' +
      safe(s.saved_rows) + ' / ' + safe(s.detected_rows) + '</td><td>' + safe(s.skipped_rows) + '</td><td>' +
      '<span class="status-pill ' + (s.status==="complete"?"good":"neutral") + '">' + safe(status) +
      (Number(s.failed_rows) ? ' · ' + safe(s.failed_rows) + ' failed' : '') + '</span></td></tr>';
  }).join("");
}
function alertLabel(type) {
  const labels = {
    onboarding_shortfall:"Onboarding AP",weekly_shortfall:"Weekly quota",monthly_shortfall:"Monthly quota",
    custom_shortfall:"Custom quota",weekly_data_gap:"Weekly data gap",quota_data_gap:"Quota data gap",
    ovr_shortfall:"OVR threshold"
  };
  return labels[type] || type;
}
function renderAlerts() {
  const tbody = $("alertsBody");
  if (!allAlerts.length) {
    tbody.innerHTML = '<tr class="empty"><td colspan="4">No alerts for this workspace.</td></tr>';
    return;
  }
  tbody.innerHTML = allAlerts.map(a => {
    const member = allMembers.find(m=>String(m.id)===String(a.member_id));
    return '<tr><td>' + safe(new Date(a.created_at).toLocaleString()) + '</td><td><strong>' + safe(a.title) +
      '</strong><div class="subtext">' + safe(alertLabel(a.alert_type)) + '</div></td><td>' +
      safe(member?.player_name||"League data") + '</td><td>' +
      (a.read_at ? '<span class="status-pill neutral">Read</span>' :
      '<button class="small-button" type="button" data-alert-read="' + Number(a.id) + '">Mark read</button>') +
      '</td></tr>';
  }).join("");
}
function renderActionReviews() {
  const tbody = $("actionReviewsBody");
  if (!allActions.length) {
    tbody.innerHTML = '<tr class="empty"><td colspan="5">No review recommendations. AP/OVR rules create recommendations when the available snapshot data meets a rule.</td></tr>';
    return;
  }
  tbody.innerHTML = allActions.map(a => {
    const member = allMembers.find(m=>String(m.id)===String(a.member_id));
    const statusLabel = a.status==="pending"?"Needs decision":a.status==="approved"?"Approved · manual only":a.status==="declined"?"Declined":"Completed manually";
    let action = "";
    if (a.status==="pending") {
      action = '<div class="action-buttons"><button class="small-button primary-button" type="button" data-action-decision="' + Number(a.id) + '" data-decision="approve">Approve</button><button class="small-button" type="button" data-action-decision="' + Number(a.id) + '" data-decision="decline">Decline</button></div>';
    } else if (a.status==="approved") {
      action = '<button class="small-button" type="button" data-action-complete="' + Number(a.id) + '">Confirm manual removal</button>';
    } else if (a.status==="completed") {
      action = '<div class="subtext">' + safe(a.completion_note||"Confirmed in game") + '</div>';
    }
    return '<tr><td>' + safe(new Date(a.proposed_at).toLocaleString()) + '</td><td><strong>' +
      safe(member?.player_name||"League member") + '</strong><div class="subtext">OVR ' + safe(member?.ovr ?? "—") +
      ' · ' + safe(member?.last_points ?? 0) + ' AP</div></td><td><div class="reason-text">' + safe(a.reason) +
      '</div></td><td><span class="status-pill ' + (a.status==="pending"?"warn":a.status==="completed"?"good":"neutral") +
      '">' + safe(statusLabel) + '</span></td><td>' + action + '</td></tr>';
  }).join("");
}
async function loadRules() {
  const {data,error}=await db.from("league_policy_rules").select("*").eq("workspace_id",activeWorkspaceId).order("id");
  if(error) throw error;
  allRules=data||[];
  renderRules();
}
async function loadWorkspaceContext() {
  if (!currentUser) return;
  let {data:membership,error}=await db.from("workspace_members").select("workspace_id,role").eq("user_id",currentUser.id);
  if(error) throw error;
  if(!membership || !membership.length) {
    const {data,error:createError}=await db.rpc("create_league_workspace",{p_name:"My League"});
    if(createError) throw createError;
    membership=[{workspace_id:data,role:"owner"}];
  }
  const ids=membership.map(m=>m.workspace_id);
  const {data:wsData,error:wsError}=await db.from("league_workspaces").select("id,name,created_at").in("id",ids).order("created_at");
  if(wsError) throw wsError;
  workspaces=wsData||[];
  if(!workspaces.length) throw new Error("No accessible league workspace was found.");
  const remembered=window.localStorage.getItem("fcp_active_workspace");
  activeWorkspaceId=workspaces.some(w=>w.id===remembered)?remembered:workspaces[0].id;
  $("workspaceSelect").innerHTML=workspaces.map(w=>'<option value="' + safe(w.id) + '">' + safe(w.name) + '</option>').join("");
  $("workspaceSelect").value=activeWorkspaceId;
  $("workspaceSelect").disabled=workspaces.length<2;
  $("workspaceHeading").textContent=workspaces.find(w=>w.id===activeWorkspaceId)?.name || "My League";
}
async function loadMembers() {
  if(!activeWorkspaceId) return;
  const {data,error}=await db.from("league_members").select("*").eq("workspace_id",activeWorkspaceId).order("joined_at",{ascending:false});
  if(error) throw error;
  allMembers=data||[];
  members=allMembers.filter(m=>m.status!=="removed");
  const memberIds=allMembers.map(m=>m.id);
  if(memberIds.length) {
    const customHours=Number(allRules.find(r=>r.rule_type==="activity_quota"&&r.period_type==="custom")?.duration_hours||0);
    const historyDays=Math.min(370,Math.max(46,Math.ceil(customHours/24)+3));
    const since=new Date(Date.now()-historyDays*86400000).toISOString();
    const historyResult=await db.from("activity_history").select("id,member_id,activity_points,recorded_at")
      .in("member_id",memberIds).gte("recorded_at",since).order("recorded_at",{ascending:true});
    if(historyResult.error) throw historyResult.error;
    allHistory=historyResult.data||[];
  } else allHistory=[];
  const [alertResult,snapshotResult,actionResult]=await Promise.all([
    db.from("league_alerts").select("*").eq("workspace_id",activeWorkspaceId).order("created_at",{ascending:false}).limit(100),
    db.from("league_roster_snapshots").select("id,workspace_id,scanned_at,detected_rows,saved_rows,skipped_rows,failed_rows,status,source")
      .eq("workspace_id",activeWorkspaceId).order("scanned_at",{ascending:false}).limit(30),
    db.from("league_action_reviews").select("*").eq("workspace_id",activeWorkspaceId).order("proposed_at",{ascending:false}).limit(100)
  ]);
  if(alertResult.error) throw alertResult.error;
  if(snapshotResult.error) throw snapshotResult.error;
  if(actionResult.error) throw actionResult.error;
  allAlerts=alertResult.data||[];
  allSnapshots=snapshotResult.data||[];
  allActions=actionResult.data||[];
  renderMetrics();renderMembers();renderSnapshots();renderAlerts();renderActionReviews();
}
async function refreshWorkspace() {
  try { await loadRules(); await loadMembers(); showMessage(""); }
  catch(e) { showMessage("Could not load this workspace. " + (e.message||e),true); }
}
async function initUser(user) {
  if(!user) return;
  if(initializedUserId===user.id && activeWorkspaceId) { setAuthVisibility(user); return; }
  if(initializingUserId===user.id && initUserPromise) return initUserPromise;
  initializingUserId=user.id;
  initUserPromise=(async()=>{
    initializedUserId=user.id;
    currentUser=user;
    setAuthVisibility(user);
    $("userAvatar").textContent=String(user.user_metadata?.full_name||user.email||"U").trim().slice(0,1).toUpperCase();
    try { await loadWorkspaceContext(); await refreshWorkspace(); }
    catch(e) { showMessage("Signed in, but workspace initialization failed: " + (e.message||e),true); }
    finally {
      if(initializingUserId===user.id) { initializingUserId=null; initUserPromise=null; }
    }
  })();
  return initUserPromise;
}
function requireCaptcha() {
  if(TURNSTILE_SITE_KEY==="SET_CLOUDFLARE_TURNSTILE_SITE_KEY" || !turnstileWidgetId) {
    showMessage("CAPTCHA is not configured yet. Add the Cloudflare Turnstile site key to app.js and enable CAPTCHA protection in Supabase Auth before opening sign-up publicly.",true);
    return null;
  }
  if(!captchaToken) {
    showMessage("Complete the CAPTCHA challenge first.",true);
    return null;
  }
  return captchaToken;
}
function resetCaptcha() {
  captchaToken="";
  try { if(window.turnstile && turnstileWidgetId!==null) window.turnstile.reset(turnstileWidgetId); } catch(_) {}
}
window.initFcpTurnstile=function() {
  const box=$("turnstileWidget");
  if(!box) return;
  if(TURNSTILE_SITE_KEY==="SET_CLOUDFLARE_TURNSTILE_SITE_KEY") {
    $("captchaSetupNote").hidden=false;
    return;
  }
  if(!window.turnstile) return;
  try {
    turnstileWidgetId=window.turnstile.render(box,{
      sitekey:TURNSTILE_SITE_KEY,
      callback:token=>{captchaToken=token;showMessage("");},
      "expired-callback":()=>{captchaToken="";},
      "error-callback":()=>{captchaToken="";showMessage("CAPTCHA could not load. Check the Turnstile site key and network.",true);}
    });
    $("captchaSetupNote").hidden=true;
  } catch(e) { showMessage("CAPTCHA setup error: "+e.message,true); }
};
function updateQuotaPeriodVisibility() {
  $("quotaHoursField").hidden=$("quotaPeriod").value!=="custom";
}
function validateWholeNumber(value,min,max,label) {
  const n=Number(value);
  if(!Number.isInteger(n)||n<min||n>max) throw new Error(label+" must be a whole number from "+min+" to "+max+".");
  return n;
}
async function savePolicies(event) {
  event.preventDefault();
  const button=$("savePolicies");
  button.disabled=true;
  try {
    const onboarding=allRules.find(r=>r.rule_type==="onboarding");
    const quota=allRules.find(r=>r.rule_type==="activity_quota");
    const ovr=allRules.find(r=>r.rule_type==="ovr_threshold");
    if(!onboarding||!quota||!ovr) throw new Error("Default policies are missing. Refresh your workspace and try again.");
    const target=validateWholeNumber($("onboardingTarget").value,1,9999999,"Onboarding AP target");
    const hours=validateWholeNumber($("onboardingHours").value,1,8760,"Onboarding hours");
    const quotaTarget=validateWholeNumber($("quotaTarget").value,1,9999999,"AP quota");
    const period=$("quotaPeriod").value;
    const quotaHours=period==="custom"?validateWholeNumber($("quotaHours").value,1,8760,"Custom window hours"):null;
    const minOvr=validateWholeNumber($("minimumOvr").value,1,999,"Minimum OVR");
    const results=await Promise.all([
      db.from("league_policy_rules").update({target_ap:target,duration_hours:hours,enabled:true,updated_at:new Date().toISOString()})
        .eq("id",onboarding.id).eq("workspace_id",activeWorkspaceId),
      db.from("league_policy_rules").update({target_ap:quotaTarget,period_type:period,duration_hours:quotaHours,enabled:true,updated_at:new Date().toISOString()})
        .eq("id",quota.id).eq("workspace_id",activeWorkspaceId),
      db.from("league_policy_rules").update({minimum_ovr:minOvr,enabled:$("ovrEnabled").checked,updated_at:new Date().toISOString()})
        .eq("id",ovr.id).eq("workspace_id",activeWorkspaceId)
    ]);
    const failure=results.find(r=>r.error);
    if(failure) throw failure.error;
    await loadRules();
    showMessage("Policies saved. Cloud checks use these targets; resulting actions remain recommendations for human review.");
  } catch(e) { showMessage("Could not save policies: "+(e.message||e),true); }
  finally { button.disabled=false; }
}
async function addManualMember(event) {
  event.preventDefault();
  const button=$("addMemberButton");
  button.disabled=true;
  try {
    const name=$("playerName").value.trim();
    if(name.length<2) throw new Error("Enter a valid player name.");
    const points=validateWholeNumber($("playerPoints").value,0,9999999,"Starting AP");
    const rawOvr=$("playerOvr").value.trim();
    const ovr=rawOvr===""?null:validateWholeNumber(rawOvr,1,999,"OVR");
    const now=new Date();
    const onboarding=onboardingRule();
    const {data,error}=await db.from("league_members").insert({
      workspace_id:activeWorkspaceId,player_name:name,joined_at:now.toISOString(),
      initial_deadline:new Date(now.getTime()+Number(onboarding?.duration_hours||2)*3600000).toISOString(),
      initial_points:points,last_points:points,last_checked_at:now.toISOString(),ovr:ovr,status:"pending"
    }).select().single();
    if(error) throw error;
    const history=await db.from("activity_history").insert({member_id:data.id,activity_points:points,recorded_at:now.toISOString()});
    if(history.error) throw history.error;
    $("addMemberForm").reset();
    await loadMembers();
    showMessage("Member added to this workspace. The starting AP is the baseline for future comparisons.");
  } catch(e) { showMessage("Could not add member: "+(e.message||e),true); }
  finally { button.disabled=false; }
}
async function updateMemberAP(button) {
  const member=allMembers.find(m=>String(m.id)===button.dataset.points);
  if(!member) return;
  const raw=window.prompt("Enter the current total AP shown in FC Mobile:",String(member.last_points??0));
  if(raw===null) return;
  const points=Number(raw);
  if(!Number.isInteger(points)||points<0||points>9999999) { showMessage("AP must be a whole number from 0 to 9,999,999.",true); return; }
  button.disabled=true;
  try {
    const now=new Date();
    const earned=Math.max(0,points-Number(member.initial_points||0));
    const onboarding=onboardingRule();
    const deadline=new Date(member.joined_at).getTime()+Number(onboarding?.duration_hours||2)*3600000;
    const nextStatus=earned>=Number(onboarding?.target_ap||500)?"active":
      (member.status!=="active" && now.getTime()>=deadline ? "review":member.status);
    const {error}=await db.from("league_members").update({last_points:points,last_checked_at:now.toISOString(),status:nextStatus})
      .eq("id",member.id).eq("workspace_id",activeWorkspaceId);
    if(error) throw error;
    const history=await db.from("activity_history").insert({member_id:member.id,activity_points:points,recorded_at:now.toISOString()});
    if(history.error) throw history.error;
    await loadMembers();
    showMessage("AP snapshot saved. This reading came from your manual check, not a live game API.");
  } catch(e) { showMessage("Could not update AP: "+(e.message||e),true); }
  finally { button.disabled=false; }
}
async function updateMemberOVR(button) {
  const member=allMembers.find(m=>String(m.id)===button.dataset.ovr);
  if(!member) return;
  const raw=window.prompt("Enter the OVR visible in FC Mobile, or leave blank to clear it:",member.ovr==null?"":String(member.ovr));
  if(raw===null) return;
  let ovr=null;
  if(raw.trim()!=="") {
    const parsed=Number(raw);
    if(!Number.isInteger(parsed)||parsed<1||parsed>999) { showMessage("OVR must be a whole number from 1 to 999, or blank.",true); return; }
    ovr=parsed;
  }
  button.disabled=true;
  try {
    const {error}=await db.from("league_members").update({ovr}).eq("id",member.id).eq("workspace_id",activeWorkspaceId);
    if(error) throw error;
    await loadMembers();
    showMessage("OVR saved for this workspace roster. OVR checks depend on values you verify from the game.");
  } catch(e) { showMessage("Could not save OVR: "+(e.message||e),true); }
  finally { button.disabled=false; }
}
async function saveOcrSnapshot() {
  readDraftEdits();
  const selected=ocrDrafts.filter(r=>r.selected);
  if(!selected.length) { showMessage("Select at least one reviewed row.",true); return; }
  for(const row of selected) {
    if(!String(row.name||"").trim()||!Number.isInteger(Number(row.points))||Number(row.points)<0||Number(row.points)>9999999) {
      showMessage("Each selected row needs a player name and a whole-number AP value.",true); return;
    }
  }
  const mode=$("syncMode").value;
  const button=$("syncSelected");
  button.disabled=true;button.textContent="Saving snapshot…";
  let snapshotId=null,created=0,updated=0,skipped=0,failed=0;
  const errors=[],snapshotRows=[],scannedAt=new Date().toISOString();
  try {
    const {data:userData,error:userError}=await db.auth.getUser();
    if(userError) throw userError;
    const {data:snapshot,error:snapshotError}=await db.from("league_roster_snapshots").insert({
      workspace_id:activeWorkspaceId,scanned_at:scannedAt,source:"reviewed_screenshot_ocr",
      uploaded_by:userData.user?.id||null,detected_rows:selected.length,status:"processing"
    }).select("id").single();
    if(snapshotError) throw snapshotError;
    snapshotId=snapshot.id;
    for(const row of selected) {
      const name=String(row.name).trim().replace(/\s+/g," ");
      const points=Number(row.points);
      const existing=allMembers.find(m=>normalizedName(m.player_name)===normalizedName(name));
      let memberId=existing?.id??null,outcome="failed",details=null;
      const confidence=Number.isFinite(Number(row.confidence))?Math.max(0,Math.min(100,Math.round(Number(row.confidence)))):null;
      if(existing?.status==="removed") {
        skipped++;outcome="skipped";details="Already marked removed in this workspace.";
        snapshotRows.push({snapshot_id:snapshotId,member_id:memberId,player_name:name,activity_points:points,ocr_confidence:confidence,outcome,details});
        continue;
      }
      if(existing) {
        let nextStatus=existing.status;
        const rule=onboardingRule();
        const earned=Math.max(0,points-Number(existing.initial_points||0));
        const deadline=new Date(existing.joined_at).getTime()+Number(rule?.duration_hours||2)*3600000;
        if(mode==="baseline") nextStatus="active";
        else if(earned>=Number(rule?.target_ap||500)) nextStatus="active";
        else if(nextStatus!=="active" && Date.now()>=deadline) nextStatus="review";
        const {error}=await db.from("league_members").update({last_points:points,last_checked_at:scannedAt,status:nextStatus})
          .eq("id",existing.id).eq("workspace_id",activeWorkspaceId);
        if(error) {
          failed++;errors.push(name+": "+error.message);
          snapshotRows.push({snapshot_id:snapshotId,member_id:memberId,player_name:name,activity_points:points,ocr_confidence:confidence,outcome:"failed",details:error.message});
          continue;
        }
        updated++;outcome="updated";
      } else {
        const rule=onboardingRule();
        const {data,error}=await db.from("league_members").insert({
          workspace_id:activeWorkspaceId,player_name:name,joined_at:scannedAt,
          initial_deadline:new Date(new Date(scannedAt).getTime()+Number(rule?.duration_hours||2)*3600000).toISOString(),
          initial_points:points,last_points:points,last_checked_at:scannedAt,status:mode==="baseline"?"active":"pending"
        }).select().single();
        if(error) {
          failed++;errors.push(name+": "+error.message);
          snapshotRows.push({snapshot_id:snapshotId,member_id:null,player_name:name,activity_points:points,ocr_confidence:confidence,outcome:"failed",details:error.message});
          continue;
        }
        memberId=data.id;created++;outcome="created";
      }
      const hist=await db.from("activity_history").insert({member_id:memberId,activity_points:points,recorded_at:scannedAt});
      if(hist.error) { failed++;errors.push(name+" history: "+hist.error.message);outcome="failed";details=hist.error.message; }
      snapshotRows.push({snapshot_id:snapshotId,member_id:memberId,player_name:name,activity_points:points,ocr_confidence:confidence,outcome,details});
    }
    const rowInsert=await db.from("league_roster_snapshot_rows").insert(snapshotRows);
    if(rowInsert.error) errors.push("Snapshot row details: "+rowInsert.error.message);
    const savedRows=snapshotRows.filter(r=>r.outcome==="created"||r.outcome==="updated").length;
    const skippedRows=snapshotRows.filter(r=>r.outcome==="skipped").length;
    const failedRows=rowInsert.error?selected.length:snapshotRows.filter(r=>r.outcome==="failed").length;
    const snapshotStatus=failedRows===0?"complete":(savedRows===0&&skippedRows===0?"failed":"partial");
    const summary=await db.from("league_roster_snapshots").update({saved_rows:savedRows,skipped_rows:skippedRows,failed_rows:failedRows,status:snapshotStatus})
      .eq("id",snapshotId).eq("workspace_id",activeWorkspaceId);
    if(summary.error) errors.push("Snapshot summary: "+summary.error.message);
    await loadMembers();
    showMessage("Snapshot #"+snapshotId+": "+created+" added, "+updated+" updated, "+skipped+" skipped, "+failed+" row/history issues."+
      (errors.length?" Details: "+errors.slice(0,3).join(" | "):""));
  } catch(e) {
    errors.push(e.message||String(e));
    if(snapshotId!==null) {
      try { await db.from("league_roster_snapshots").update({status:"partial",failed_rows:selected.length}).eq("id",snapshotId); } catch(_) {}
    }
    showMessage("Snapshot failed. "+errors.slice(0,3).join(" | "),true);
  } finally {
    button.disabled=false;
    button.innerHTML='Save selected <span aria-hidden="true">→</span>';
  }
}
function periodKeyForBulk(rule) {
  const now=new Date();
  if(rule.period_type==="weekly") {
    const start=indiaWeekStart(now);
    const p=indiaParts(start);
    return {start:start.toISOString(),key:p.year+"-"+p.month+"-"+p.day,type:"weekly_shortfall"};
  }
  if(rule.period_type==="monthly") {
    const p=indiaParts(now);
    const start=new Date(p.year+"-"+p.month+"-01T00:00:00+05:30");
    return {start:start.toISOString(),key:p.year+"-"+p.month,type:"monthly_shortfall"};
  }
  const h=Number(rule.duration_hours||24);
  const bucket=Math.floor(now.getTime()/(h*3600000))*h*3600000-h*3600000;
  const start=new Date(bucket);
  const p=indiaParts(start);
  return {start:start.toISOString(),key:p.year+"-"+p.month+"-"+p.day+"-"+p.hour,type:"custom_shortfall"};
}
async function createBulkRecommendations() {
  const button=$("bulkRecommend");
  button.disabled=true;
  try {
    const kind=$("bulkCriteria").value;
    const now=new Date();
    let rows=[];
    if(kind==="ovr") {
      const rule=ovrRule();
      if(!rule||!rule.enabled) throw new Error("Enable the OVR rule and save your policies first.");
      rows=allMembers.filter(m=>m.status!=="removed"&&m.ovr!=null&&Number(m.ovr)<Number(rule.minimum_ovr)).map(m=>({
        workspace_id:activeWorkspaceId,member_id:m.id,rule_id:rule.id,alert_type:"ovr_shortfall",
        period_start:new Date(now.getFullYear(),now.getMonth(),now.getDate()).toISOString(),
        fingerprint:"ovr:"+activeWorkspaceId+":"+rule.id+":"+m.id+":"+indiaParts(now).year+"-"+indiaParts(now).month+"-"+indiaParts(now).day,
        title:"Below OVR threshold",message:m.player_name+" has OVR "+m.ovr+", below configured minimum "+rule.minimum_ovr+". Confirm the displayed OVR and review manually.",
        severity:"warning"
      }));
    } else {
      const rule=quotaRule();
      if(!rule||!rule.enabled) throw new Error("Enable and save an AP quota first.");
      const period=periodKeyForBulk(rule);
      rows=allMembers.filter(m=>m.status!=="removed").map(m=>({member:m,points:pointsInWindow(m.id,rule,now)}))
        .filter(x=>x.points!==null&&x.points<Number(rule.target_ap||1500))
        .map(x=>({
          workspace_id:activeWorkspaceId,member_id:x.member.id,rule_id:rule.id,alert_type:period.type,
          period_start:period.start,
          fingerprint:"quota:"+activeWorkspaceId+":"+rule.id+":"+x.member.id+":"+period.key,
          title:period.type==="weekly_shortfall"?"Weekly AP target missed":period.type==="monthly_shortfall"?"Monthly AP target missed":"Custom-window AP target missed",
          message:x.member.player_name+" has an estimated "+x.points+" / "+rule.target_ap+" AP for the "+rule.period_type+" quota. Review the snapshot evidence before any removal.",
          severity:"warning"
        }));
    }
    if(!rows.length) { showMessage("No members matched this criterion, or there isn't enough snapshot history to calculate AP.",false); return; }
    const {error}=await db.from("league_alerts").upsert(rows,{onConflict:"fingerprint",ignoreDuplicates:true});
    if(error) throw error;
    await loadMembers();
    showMessage(rows.length+" recommendation candidate(s) processed. Existing fingerprints are not duplicated. No in-game kick was executed.");
  } catch(e) { showMessage("Could not create bulk recommendations: "+(e.message||e),true); }
  finally { button.disabled=false; }
}
async function reviewAction(button,decision) {
  if(decision==="approve"&&!window.confirm("Approve the recommendation for manual in-game action? This website will not kick a player.")) return;
  if(decision==="decline"&&!window.confirm("Decline this recommendation?")) return;
  button.disabled=true;
  try {
    const {error}=await db.rpc("review_league_action",{p_action_id:Number(button.dataset.actionDecision),p_decision:decision});
    if(error) throw error;
    await loadMembers();
    showMessage(decision==="approve"?"Approved for manual review only. No FC Mobile action was executed.":"Recommendation declined.");
  } catch(e) { showMessage("Review update failed: "+(e.message||e),true); }
  finally { button.disabled=false; }
}
async function completeManualAction(button) {
  if(!window.confirm("Only confirm if you have already removed this player inside FC Mobile. The website cannot do the kick.")) return;
  const note=window.prompt("Write an audit note:", "Removed manually in FC Mobile by league admin");
  if(!note||!note.trim()) { showMessage("An audit note is required. The item remains approved.",true); return; }
  button.disabled=true;
  try {
    const {error}=await db.rpc("complete_league_action",{p_action_id:Number(button.dataset.actionComplete),p_note:note.trim()});
    if(error) throw error;
    await loadMembers();
    showMessage("Manual removal recorded. The member is marked removed in this workspace only.");
  } catch(e) { showMessage("Could not record completion: "+(e.message||e),true); }
  finally { button.disabled=false; }
}
async function startEmailOtp(event) {
  event.preventDefault();
  const token=requireCaptcha();
  if(!token) return;
  const email=$("email").value.trim().toLowerCase();
  if(!email) { showMessage("Enter a valid email address.",true); return; }
  const button=$("sendCode");
  button.disabled=true;
  try {
    const {error}=await db.auth.signInWithOtp({
      email,
      options:{shouldCreateUser:true,captchaToken:token,emailRedirectTo:window.location.origin+window.location.pathname}
    });
    if(error) throw error;
    $("otpEmail").value=email;
    $("otpPanel").hidden=false;
    $("sendCodePanel").hidden=true;
    showMessage("A verification code was sent to "+email+". Check your inbox and spam folder.");
  } catch(e) { showMessage("Could not send the verification code: "+(e.message||e),true); }
  finally { button.disabled=false;resetCaptcha(); }
}
async function verifyEmailOtp(event) {
  event.preventDefault();
  const email=$("otpEmail").value.trim().toLowerCase();
  const token=$("emailCode").value.trim().replace(/\s/g,"");
  if(!email||!token) { showMessage("Enter the code sent to your email.",true); return; }
  const button=$("verifyCode");
  button.disabled=true;
  try {
    const {data,error}=await db.auth.verifyOtp({email,token,type:"email"});
    if(error) throw error;
    $("otpPanel").hidden=true;
    if(data.user) await initUser(data.user);
    showMessage("Email verified. Your workspace is ready.");
  } catch(e) { showMessage("Code verification failed: "+(e.message||e),true); }
  finally { button.disabled=false; }
}
async function googleLogin() {
  const token=requireCaptcha();
  if(!token) return;
  try {
    const {error}=await db.auth.signInWithOAuth({
      provider:"google",
      options:{redirectTo:window.location.origin+window.location.pathname,queryParams:{prompt:"select_account"}}
    });
    if(error) throw error;
  } catch(e) { showMessage("Google sign-in could not start. Check that the Google provider is configured in Supabase Auth. "+(e.message||e),true); }
  finally { resetCaptcha(); }
}
async function init() {
  if(!window.supabase||typeof window.supabase.createClient!=="function") {
    showMessage("The sign-in library did not load. Check the network and reload.",true);return;
  }
  db=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
  $("sendCodeForm").addEventListener("submit",startEmailOtp);
  $("verifyCodeForm").addEventListener("submit",verifyEmailOtp);
  $("googleLogin").addEventListener("click",googleLogin);
  $("changeEmail").addEventListener("click",()=>{
    $("otpPanel").hidden=true;$("sendCodePanel").hidden=false;$("emailCode").value="";showMessage("");
  });
  $("signOut").addEventListener("click",async()=>{
    const {error}=await db.auth.signOut();
    if(error) { showMessage("Sign-out failed: "+error.message,true);return; }
    currentUser=null;initializedUserId=null;activeWorkspaceId=null;
    allMembers=[];allHistory=[];allAlerts=[];allActions=[];allSnapshots=[];allRules=[];
    setAuthVisibility(null);showMessage("You have signed out.");
  });
  $("workspaceSelect").addEventListener("change",async()=>{
    activeWorkspaceId=$("workspaceSelect").value;
    window.localStorage.setItem("fcp_active_workspace",activeWorkspaceId);
    await refreshWorkspace();
  });
  $("createWorkspaceButton").addEventListener("click",async()=>{
    const name=window.prompt("Name this league workspace (2–80 characters):","My League");
    if(name===null) return;
    if(name.trim().length<2||name.trim().length>80) { showMessage("Workspace name must be 2–80 characters.",true);return; }
    try {
      const {data,error}=await db.rpc("create_league_workspace",{p_name:name.trim()});
      if(error) throw error;
      activeWorkspaceId=data;
      window.localStorage.setItem("fcp_active_workspace",activeWorkspaceId);
      await loadWorkspaceContext();await refreshWorkspace();
      showMessage("Workspace created. Its members and rules are separate from your other leagues.");
    } catch(e) { showMessage("Could not create workspace: "+(e.message||e),true); }
  });
  $("addMemberForm").addEventListener("submit",addManualMember);
  $("savePoliciesForm").addEventListener("submit",savePolicies);
  $("quotaPeriod").addEventListener("change",updateQuotaPeriodVisibility);
  $("scanForm").addEventListener("submit",async event=>{
    event.preventDefault();
    const files=[...$("rosterImages").files];
    if(!files.length) { showMessage("Choose a screenshot first.",true);return; }
    if(files.length>8) { showMessage("Choose no more than 8 screenshots per batch.",true);return; }
    if(files.some(f=>f.size>12*1024*1024)) { showMessage("Each screenshot must be 12 MB or smaller.",true);return; }
    const button=$("scanButton");button.disabled=true;button.textContent="Scanning screenshots…";showMessage("");
    try { await scanScreenshots(files); }
    catch(e) { showMessage("Screenshot scan failed: "+(e.message||e),true);$("ocrStatus").textContent="Scan failed"; }
    finally { button.disabled=false;button.innerHTML='Scan screenshots <span aria-hidden="true">⌕</span>'; }
  });
  $("syncSelected").addEventListener("click",saveOcrSnapshot);
  $("discardScan").addEventListener("click",()=>{
    ocrDrafts=[];rawOcrText="";$("ocrReview").hidden=true;$("ocrProgressBox").hidden=true;$("rosterImages").value="";
    showMessage("The OCR draft was discarded. Nothing was saved.");
  });
  $("membersBody").addEventListener("click",async event=>{
    const pointsButton=event.target.closest("button[data-points]");
    const ovrButton=event.target.closest("button[data-ovr]");
    if(pointsButton) await updateMemberAP(pointsButton);
    else if(ovrButton) await updateMemberOVR(ovrButton);
  });
  $("alertsBody").addEventListener("click",async event=>{
    const button=event.target.closest("button[data-alert-read]");
    if(!button)return;
    button.disabled=true;
    try {
      const {error}=await db.from("league_alerts").update({read_at:new Date().toISOString()})
        .eq("id",Number(button.dataset.alertRead)).eq("workspace_id",activeWorkspaceId);
      if(error) throw error;
      await loadMembers();showMessage("Alert marked as read.");
    } catch(e) { showMessage("Could not update alert: "+(e.message||e),true); }
    finally { button.disabled=false; }
  });
  $("actionReviewsBody").addEventListener("click",async event=>{
    const decision=event.target.closest("button[data-action-decision]");
    if(decision) { await reviewAction(decision,decision.dataset.decision);return; }
    const complete=event.target.closest("button[data-action-complete]");
    if(complete) await completeManualAction(complete);
  });
  $("bulkRecommend").addEventListener("click",createBulkRecommendations);
  $("refreshDashboard").addEventListener("click",async()=>{
    const button=$("refreshDashboard");button.disabled=true;
    try { await refreshWorkspace();showMessage("Workspace refreshed."); }
    finally { button.disabled=false; }
  });
  $("fcConnectButton").addEventListener("click",()=>{
    showMessage("EA account connection is not available yet: no supported, verified FC Mobile league/AP API or authorization flow has been confirmed. Do not enter an EA password or OTP here. Screenshot import remains available.",true);
  });

  if(window.turnstile && typeof window.initFcpTurnstile==="function") window.initFcpTurnstile();
  else window.addEventListener("load",()=>{if(window.turnstile && typeof window.initFcpTurnstile==="function") window.initFcpTurnstile();},{once:true});

  db.auth.onAuthStateChange((_event,session)=>{
    if(session?.user) { Promise.resolve().then(()=>initUser(session.user)); }
    else if(!_event || _event==="SIGNED_OUT") {
      currentUser=null;activeWorkspaceId=null;initializedUserId=null;setAuthVisibility(null);
    }
  });
  const {data,error}=await db.auth.getSession();
  if(error) throw error;
  if(data.session?.user) await initUser(data.session.user);
  else setAuthVisibility(null);
}
init().catch(e=>showMessage("Startup error: "+(e.message||e),true));

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
