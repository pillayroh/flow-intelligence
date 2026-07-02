import * as vscode from "vscode";

function nonce(): string {
  let s = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 24; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

export function getHtml(webview: vscode.Webview, _extensionUri: vscode.Uri): string {
  const n = nonce();
  const csp = [
    "default-src 'none'",
    "img-src data:",
    "style-src 'unsafe-inline'",
    `script-src 'nonce-${n}'`,
  ].join("; ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  /* Light: warm beige + magenta accent */
  :root{
    --bg:#f4ece0; --panel:#fbf6ee; --panel2:#f0e7d8; --ink:#463d34;
    --muted:#8c8073; --line:#e6dac7; --accent:#c0398f; --accentSoft:#f2cfe6;
    --sage:#8a9a7b; --ok:#7f9a6e; --shadow:rgba(120,90,50,.10);
  }
  /* Dark: deep plum + brighter magenta */
  body[data-theme="dark"]{
    --bg:#1d1922; --panel:#272030; --panel2:#312839; --ink:#f1e9f2;
    --muted:#a99fb3; --line:#3b3247; --accent:#e968bd; --accentSoft:#5b2f4d;
    --sage:#a3c08c; --ok:#8fb47a; --shadow:rgba(0,0,0,.35);
  }
  *{box-sizing:border-box}
  body{
    margin:0; padding:12px; background:var(--bg); color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
    font-size:12.5px; line-height:1.45; transition:background .25s,color .25s;
  }
  .head{display:flex;align-items:center;gap:9px;margin-bottom:12px}
  .logo{width:26px;height:26px;flex:0 0 auto}
  .logo .disc{fill:var(--accentSoft)}
  .logo .wave1{stroke:var(--accent)}
  .logo .wave2{stroke:var(--sage)}
  .title{font-weight:600;font-size:14px;letter-spacing:.2px}
  .sub{color:var(--muted);font-size:11px}
  .right{margin-left:auto;display:flex;align-items:center;gap:8px}
  .iconbtn{border:1px solid var(--line);background:var(--panel2);color:var(--ink);
    width:26px;height:26px;border-radius:8px;cursor:pointer;font-size:13px;line-height:1;padding:0}
  .iconbtn:hover{border-color:var(--accent)}
  .pill{display:inline-flex;align-items:center;gap:6px;
    padding:4px 10px;border-radius:999px;background:var(--panel2);
    border:1px solid var(--line);font-size:11px;font-weight:600}
  .dot{width:8px;height:8px;border-radius:50%;background:var(--muted)}
  .dot.live{background:var(--ok);animation:pulse 2s infinite}
  .dot.paused{background:var(--accent)}
  @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(137,154,110,.5)}70%{box-shadow:0 0 0 7px rgba(137,154,110,0)}100%{box-shadow:0 0 0 0 rgba(137,154,110,0)}}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:14px;
    padding:13px 14px;margin-bottom:11px;box-shadow:0 2px 10px var(--shadow)}
  .card h3{margin:0 0 10px;font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);font-weight:700}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .stat{background:var(--panel2);border-radius:10px;padding:9px 10px}
  .stat .v{font-size:18px;font-weight:700}
  .stat .k{font-size:10.5px;color:var(--muted);margin-top:1px}
  .bar{height:14px;border-radius:8px;overflow:hidden;display:flex;background:var(--panel2);border:1px solid var(--line)}
  .bar .ai{background:var(--accent);transition:width .4s}
  .bar .hu{background:var(--sage);transition:width .4s}
  .legend{display:flex;gap:14px;margin-top:7px;font-size:11px;color:var(--muted)}
  .legend b{color:var(--ink)}
  .swatch{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:5px;vertical-align:middle}
  .spark{width:100%;height:44px;display:block}
  #spark polyline{stroke:var(--accent)}
  #spark circle{fill:var(--sage)}
  .muted{color:var(--muted)}
  .btn{border:none;border-radius:9px;padding:8px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit}
  .btn.primary{background:var(--accent);color:#fff}
  .btn.ghost{background:transparent;color:var(--muted);border:1px solid var(--line)}
  .btn.block{width:100%}
  .row{display:flex;gap:7px;flex-wrap:wrap}
  /* check-in */
  #checkin{display:none;border:1px solid var(--accent);background:linear-gradient(180deg,var(--panel),var(--panel2))}
  #checkin.show{display:block}
  .q{font-size:13.5px;font-weight:600;margin-bottom:9px}
  .flowopts{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:11px}
  .flowopt{background:var(--panel);border:1px solid var(--line);border-radius:10px;
    padding:8px 4px;text-align:center;cursor:pointer;transition:.12s}
  .flowopt:hover{transform:translateY(-1px)}
  .flowopt.sel{border-color:var(--accent);background:var(--accentSoft)}
  .flowopt .emo{font-size:19px}
  .flowopt .lbl{font-size:9.5px;color:var(--muted);margin-top:2px}
  .scale{margin-bottom:10px}
  .scale .name{font-size:11px;color:var(--muted);margin-bottom:5px}
  .pips{display:flex;gap:6px}
  .pip{flex:1;text-align:center;padding:6px 0;border-radius:8px;background:var(--panel);
    border:1px solid var(--line);cursor:pointer;font-size:11px;font-weight:600}
  .pip.sel{background:var(--sage);color:#fff;border-color:var(--sage)}
  .center{text-align:center}
  .empty{color:var(--muted);font-size:11.5px;text-align:center;padding:6px 0}
</style>
</head>
<body>
  <div class="head">
    <svg class="logo" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle class="disc" cx="16" cy="16" r="15"/>
      <path class="wave1" d="M4 20c4-6 8-6 12 0s8 6 12 0" stroke-width="2.4" stroke-linecap="round"/>
      <path class="wave2" d="M4 13c4-6 8-6 12 0s8 6 12 0" stroke-width="2.4" stroke-linecap="round" opacity=".85"/>
    </svg>
    <div>
      <div class="title">Flow Intelligence</div>
      <div class="sub">human-AI collaboration</div>
    </div>
    <div class="right">
      <button id="themeToggle" class="iconbtn" title="Toggle dark mode">🌙</button>
      <span class="pill"><span id="dot" class="dot"></span><span id="statusText">…</span></span>
    </div>
  </div>

  <!-- Not enrolled CTA -->
  <div id="enrollCard" class="card" style="display:none">
    <h3>Welcome</h3>
    <p class="muted">This extension quietly measures your coding + AI-collaboration flow (metadata only, never your code or prompts). Enroll to see your live session insights.</p>
    <button class="btn primary block" id="enrollBtn">Enroll in study</button>
  </div>

  <!-- Check-in -->
  <div id="checkin" class="card">
    <div class="q">How's your flow right now?</div>
    <div class="flowopts" id="flowopts"></div>
    <div class="scale"><div class="name">Frustration (optional)</div><div class="pips" id="frus"></div></div>
    <div class="scale"><div class="name">Confidence (optional)</div><div class="pips" id="conf"></div></div>
    <div class="row">
      <button class="btn primary" id="esmSubmit" style="flex:1" disabled>Submit</button>
      <button class="btn ghost" id="esmSkip">Skip</button>
    </div>
  </div>

  <!-- Live session -->
  <div id="liveCard" class="card" style="display:none">
    <h3>This session</h3>
    <div class="grid">
      <div class="stat"><div class="v" id="lvEdits">0</div><div class="k">edit bursts</div></div>
      <div class="stat"><div class="v" id="lvFocus">0</div><div class="k">focus switches</div></div>
      <div class="stat"><div class="v" id="lvChars">0</div><div class="k">chars written</div></div>
      <div class="stat"><div class="v" id="lvCommits">0</div><div class="k">commits</div></div>
    </div>
  </div>

  <!-- Observation: human-AI collaboration -->
  <div id="collabCard" class="card" style="display:none">
    <h3>Human · AI collaboration</h3>
    <div class="bar"><div class="ai" id="barAi" style="width:50%"></div><div class="hu" id="barHu" style="width:50%"></div></div>
    <div class="legend">
      <span><span class="swatch" style="background:var(--accent)"></span>AI <b id="aiPct">0%</b></span>
      <span><span class="swatch" style="background:var(--sage)"></span>You <b id="huPct">0%</b></span>
    </div>
    <div class="grid" style="margin-top:11px">
      <div class="stat"><div class="v" id="sPrompts">0</div><div class="k">prompts</div></div>
      <div class="stat"><div class="v" id="sAgentEdits">0</div><div class="k">agent edits</div></div>
      <div class="stat"><div class="v" id="sTabEdits">0</div><div class="k">tab accepts</div></div>
      <div class="stat"><div class="v" id="sVerify">0</div><div class="k">verifications</div></div>
    </div>
  </div>

  <!-- Flow trend -->
  <div id="trendCard" class="card" style="display:none">
    <h3>Flow trend</h3>
    <svg class="spark" id="spark" viewBox="0 0 100 44" preserveAspectRatio="none"></svg>
    <div class="center muted" id="trendLabel">no check-ins yet</div>
    <button class="btn ghost block" id="checkinBtn" style="margin-top:9px">Flow check-in now</button>
  </div>

  <!-- Personas placeholder -->
  <div id="personaCard" class="card" style="display:none;opacity:.85">
    <h3>Your developer persona</h3>
    <div class="empty">Coming soon — as we gather more of your flow data, you'll see whether you code like an Explorer, Builder, Verifier, or Delegator.</div>
  </div>

<script nonce="${n}">
  const vscode = acquireVsCodeApi();
  let checkinTrigger = "manual";
  let sel = { flow: null, frustration: null, confidence: null };

  const $ = (id) => document.getElementById(id);
  const FLOW = [
    { v:5, emo:"🔥", lbl:"deep" },
    { v:4, emo:"🙂", lbl:"focused" },
    { v:3, emo:"😐", lbl:"neutral" },
    { v:2, emo:"🌀", lbl:"scattered" },
    { v:1, emo:"😖", lbl:"blocked" },
  ];

  // ---- theme (persisted in webview state) ----
  function applyTheme(t){
    document.body.setAttribute("data-theme", t);
    $("themeToggle").textContent = t === "dark" ? "☀️" : "🌙";
  }
  let theme = (vscode.getState() || {}).theme || "light";
  applyTheme(theme);
  $("themeToggle").onclick = () => {
    theme = theme === "dark" ? "light" : "dark";
    applyTheme(theme);
    vscode.setState({ ...(vscode.getState() || {}), theme });
  };

  function buildCheckin(){
    const fo = $("flowopts"); fo.innerHTML = "";
    FLOW.forEach(o => {
      const d = document.createElement("div");
      d.className = "flowopt"; d.dataset.v = o.v;
      d.innerHTML = '<div class="emo">'+o.emo+'</div><div class="lbl">'+o.lbl+'</div>';
      d.onclick = () => { sel.flow = o.v; paintFlow(); $("esmSubmit").disabled = false; };
      fo.appendChild(d);
    });
    buildPips("frus", "frustration");
    buildPips("conf", "confidence");
  }
  function buildPips(id, key){
    const el = $(id); el.innerHTML = "";
    for(let i=1;i<=5;i++){
      const p = document.createElement("div");
      p.className = "pip"; p.textContent = i; p.dataset.v = i;
      p.onclick = () => { sel[key] = i; paintPips(id, key); };
      el.appendChild(p);
    }
  }
  function paintFlow(){
    document.querySelectorAll("#flowopts .flowopt").forEach(e =>
      e.classList.toggle("sel", Number(e.dataset.v) === sel.flow));
  }
  function paintPips(id, key){
    document.querySelectorAll("#"+id+" .pip").forEach(e =>
      e.classList.toggle("sel", Number(e.dataset.v) === sel[key]));
  }
  function resetCheckin(){ sel = { flow:null, frustration:null, confidence:null }; paintFlow(); paintPips("frus","frustration"); paintPips("conf","confidence"); $("esmSubmit").disabled = true; }
  function showCheckin(show){ $("checkin").classList.toggle("show", show); }

  $("esmSubmit").onclick = () => {
    if(sel.flow == null) return;
    vscode.postMessage({ type:"esm", trigger:checkinTrigger, flow:sel.flow, frustration:sel.frustration, confidence:sel.confidence });
    showCheckin(false); resetCheckin();
  };
  $("esmSkip").onclick = () => { showCheckin(false); resetCheckin(); };
  $("checkinBtn").onclick = () => vscode.postMessage({ type:"checkinNow" });
  $("enrollBtn").onclick = () => vscode.postMessage({ type:"enroll" });

  function setStatus(state){
    const dot = $("dot"), txt = $("statusText");
    dot.className = "dot";
    if(!state.enrolled){ txt.textContent = "Not enrolled"; }
    else if(state.running){ dot.classList.add("live"); txt.textContent = state.sessionActive ? "Running" : "Idle"; }
    else if(state.paused){ dot.classList.add("paused"); txt.textContent = "Paused"; }
    else { txt.textContent = "…"; }

    $("enrollCard").style.display = state.enrolled ? "none" : "block";
    ["liveCard","collabCard","trendCard","personaCard"].forEach(id => $(id).style.display = state.enrolled ? "block" : "none");
  }

  function renderLive(live){
    if(!live) return;
    $("lvEdits").textContent = live.human.edit_bursts;
    $("lvFocus").textContent = live.human.focus_switches;
    $("lvChars").textContent = live.human.added_chars;
    $("lvCommits").textContent = live.human.commits;
  }

  function renderSummary(s){
    const ai = s.collaboration.ai_chars, hu = s.collaboration.human_chars, total = ai+hu;
    const aiPct = total ? Math.round(ai/total*100) : 0;
    $("barAi").style.width = aiPct + "%";
    $("barHu").style.width = (100-aiPct) + "%";
    $("aiPct").textContent = aiPct + "%";
    $("huPct").textContent = (100-aiPct) + "%";
    $("sPrompts").textContent = s.ai.prompts;
    $("sAgentEdits").textContent = s.ai.agent_edits;
    $("sTabEdits").textContent = s.ai.tab_edits;
    $("sVerify").textContent = s.ai.verifications;
    renderSpark(s.esm || []);
  }

  function renderSpark(esm){
    const scores = esm.map(e => e.flow_score).filter(v => typeof v === "number");
    const svg = $("spark");
    if(scores.length < 2){ svg.innerHTML = ""; $("trendLabel").textContent = scores.length ? ("latest flow: " + scores[scores.length-1] + "/5") : "no check-ins yet"; return; }
    const w = 100, h = 44, pad = 4;
    const step = (w - pad*2) / (scores.length - 1);
    const pts = scores.map((v,i) => {
      const x = pad + i*step;
      const y = h - pad - ((v-1)/4) * (h - pad*2);
      return x.toFixed(1)+","+y.toFixed(1);
    }).join(" ");
    svg.innerHTML =
      '<polyline points="'+pts+'" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      scores.map((v,i)=>{const x=pad+i*step;const y=h-pad-((v-1)/4)*(h-pad*2);return '<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="1.7"/>';}).join("");
    $("trendLabel").textContent = "latest flow: " + scores[scores.length-1] + "/5";
  }

  window.addEventListener("message", (ev) => {
    const m = ev.data;
    if(m.type === "state"){ setStatus(m); renderLive(m.live); }
    else if(m.type === "summary"){ renderSummary(m.summary); }
    else if(m.type === "checkin"){ checkinTrigger = m.trigger || "manual"; resetCheckin(); showCheckin(true); }
  });

  buildCheckin();
  vscode.postMessage({ type:"ready" });
</script>
</body>
</html>`;
}
