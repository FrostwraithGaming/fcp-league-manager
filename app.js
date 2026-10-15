const sampleMembers = [];
const tbody = document.getElementById("membersBody");
const count = document.getElementById("memberCount");
function render() {
  count.textContent = sampleMembers.length;
  if (!sampleMembers.length) {
    tbody.innerHTML = '<tr class="empty"><td colspan="4">No members yet. Add a demo member to preview the dashboard.</td></tr>';
    return;
  }
  tbody.innerHTML = sampleMembers.map(m => {
    const elapsed = (Date.now() - m.joined) / 3600000;
    const status = m.points >= 500 ? "Onboarding target met" : elapsed >= 2 ? "Needs review" : "Within 2-hour window";
    return '<tr><td><strong>' + m.name + '</strong></td><td>' + new Date(m.joined).toLocaleString() + '</td><td>' + m.points + ' AP</td><td>' + status + '</td></tr>';
  }).join("");
}
document.getElementById("addDemo").addEventListener("click", () => {
  const n = sampleMembers.length + 1;
  sampleMembers.push({name: "Demo Player " + n, joined: Date.now(), points: [320, 650, 90, 1200][(n-1)%4]});
  render();
});
render();