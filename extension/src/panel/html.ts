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
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    `script-src 'nonce-${n}'`,
  ].join("; ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
  :root{
    --bg:#0C0C0C; --surface:#161616; --surface-raised:#1E1E1E; --border:#2E2A26;
    --text:#F0E7D8; --text-muted:#A89F92; --text-subtle:#7A7268;
    --primary:#D4C4A8; --primary-hover:#E8DCC8; --primary-muted:rgba(212,196,168,.14);
    --primary-fg:#0C0C0C;
    --secondary:#B8A88C; --secondary-hover:#C9B89C; --secondary-muted:rgba(184,168,140,.1);
    --success:#A8C49A; --warning:#D4A574; --error:#C47A7A;
    --ai:#C4B8A8; --human:#D4C4A8;
    --glow-soft:rgba(212,196,168,.12);
    --radius:12px; --ease:200ms cubic-bezier(.4,0,.2,1);
    --shadow:0 1px 3px rgba(0,0,0,.45);
    --shadow-lg:0 4px 16px rgba(0,0,0,.55);
    --space-xs:6px; --space-sm:10px; --space-md:16px; --space-lg:20px;
  }
  body[data-theme="light"]{
    --bg:#EDE6D6; --surface:#F7F2E8; --surface-raised:#F0E7D8; --border:#DDD0BC;
    --text:#3D3428; --text-muted:#7A7062; --text-subtle:#9A8F7F;
    --primary:#5C6B4A; --primary-hover:#4A5740; --primary-muted:rgba(92,107,74,.14);
    --primary-fg:#FFFFFF;
    --secondary:#8B7355; --secondary-hover:#75604A; --secondary-muted:rgba(139,115,85,.12);
    --success:#5A8F4A; --warning:#C49A3C; --error:#C45050;
    --ai:#7A8FA8; --human:#5C6B4A;
    --glow:rgba(92,107,74,.25); --glow-soft:rgba(92,107,74,.1);
    --shadow:0 1px 2px rgba(61,52,40,.08),0 2px 8px rgba(61,52,40,.05);
    --shadow-lg:0 4px 16px rgba(61,52,40,.1);
  }
  *,*::before,*::after{box-sizing:border-box}
  body{
    margin:0;padding:var(--space-md);
    background:var(--bg);color:var(--text);
    font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
    font-size:13px;line-height:1.5;
    -webkit-font-smoothing:antialiased;
    transition:background var(--ease),color var(--ease);
  }

  .head{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:var(--space-lg);gap:var(--space-sm)}
  .brand{font-weight:600;font-size:15px;letter-spacing:-.02em;color:var(--text)}
  .brand-sub{font-size:12px;color:var(--text-muted);margin-top:2px;font-weight:400}
  .head-right{display:flex;align-items:center;gap:var(--space-xs)}
  .iconbtn{
    width:32px;height:32px;border:1px solid var(--border);border-radius:var(--radius);
    background:var(--surface);color:var(--text-muted);cursor:pointer;font-size:14px;
    display:flex;align-items:center;justify-content:center;
    transition:border-color var(--ease),background var(--ease),color var(--ease),box-shadow var(--ease);
  }
  .iconbtn:hover{border-color:var(--primary);color:var(--text);background:var(--surface-raised)}
  .iconbtn:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
  .status{
    display:inline-flex;align-items:center;gap:7px;padding:6px 11px;border-radius:999px;
    border:1px solid var(--border);background:var(--surface);font-size:11px;font-weight:600;
    color:var(--text-muted);box-shadow:var(--shadow);
  }
  .dot{width:7px;height:7px;border-radius:50%;background:var(--text-subtle);flex-shrink:0;
    transition:background var(--ease),box-shadow var(--ease)}
  .dot.live{background:var(--success);box-shadow:0 0 0 3px var(--glow-soft)}
  .dot.paused{background:var(--warning);box-shadow:0 0 0 3px rgba(212,165,116,.15)}

  .sync-setup{margin-bottom:var(--space-md)}
  .sync-hint{font-size:12px;color:var(--text-muted);margin:0 0 var(--space-sm);line-height:1.5}
  .sync-row{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-sm)}
  .sync-active{margin-bottom:var(--space-md)}
  .sync-active-top{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:var(--space-sm)}
  .sync-mode-pill{
    display:inline-block;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;
    background:var(--primary-muted);color:var(--primary);border:1px solid var(--border);
  }
  .sync-status-line{font-size:12px;color:var(--text-muted);margin-top:6px}
  .sync-actions{display:flex;flex-wrap:wrap;gap:var(--space-xs)}

  .btn{
    border:none;border-radius:var(--radius);padding:10px 14px;font-size:12px;font-weight:600;
    cursor:pointer;font-family:inherit;letter-spacing:-.01em;
    transition:background var(--ease),border-color var(--ease),color var(--ease),box-shadow var(--ease),transform var(--ease);
  }
  .btn:active{transform:scale(.98)}
  .btn:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
  .btn:disabled{opacity:.45;cursor:not-allowed;transform:none}
  .btn.primary{background:var(--primary);color:var(--primary-fg);box-shadow:var(--shadow)}
  .btn.primary:hover:not(:disabled){background:var(--primary-hover)}
  .btn.secondary{background:var(--surface);color:var(--text);border:1px solid var(--border)}
  .btn.secondary:hover:not(:disabled){border-color:var(--secondary);background:var(--secondary-muted);color:var(--text)}
  .btn.ghost{background:transparent;color:var(--text-muted);border:1px solid transparent}
  .btn.ghost:hover:not(:disabled){background:var(--surface-raised);color:var(--text);border-color:var(--border)}
  .btn.block{width:100%}
  .btn.sm{padding:7px 11px;font-size:11px;border-radius:10px}

  .card{
    background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
    padding:var(--space-md);margin-bottom:var(--space-sm);box-shadow:var(--shadow);
    transition:border-color var(--ease),box-shadow var(--ease);
  }
  .card:hover{border-color:var(--glow-soft)}
  .card-title{
    font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;
    color:var(--text-muted);margin-bottom:var(--space-sm);
  }
  .card-note{font-size:11px;color:var(--text-subtle);margin-top:var(--space-sm);line-height:1.5}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-xs)}
  .stat{
    background:var(--surface-raised);border-radius:10px;padding:11px 12px;border:1px solid var(--border);
    transition:border-color var(--ease),background var(--ease);
  }
  .stat:hover{border-color:var(--glow-soft)}
  .stat .v{font-size:17px;font-weight:700;letter-spacing:-.03em;color:var(--text);font-variant-numeric:tabular-nums}
  .stat .k{font-size:10px;color:var(--text-muted);margin-top:4px;font-weight:500}

  .bar{
    height:8px;border-radius:6px;overflow:hidden;display:flex;
    background:var(--surface-raised);border:1px solid var(--border);margin-bottom:var(--space-sm);
  }
  .bar .ai{background:var(--ai);transition:width var(--ease)}
  .bar .hu{background:var(--human);transition:width var(--ease)}
  .legend{display:flex;gap:var(--space-md);font-size:11px;color:var(--text-muted);font-weight:500}
  .legend b{color:var(--text);font-weight:600}
  .sw{display:inline-block;width:8px;height:8px;border-radius:3px;margin-right:5px;vertical-align:middle}

  .accordion{
    border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);
    margin-bottom:var(--space-sm);overflow:hidden;box-shadow:var(--shadow);
    transition:border-color var(--ease);
  }
  .accordion.open{border-color:var(--glow-soft);box-shadow:var(--shadow-lg)}
  .acc-head{
    width:100%;display:flex;align-items:center;justify-content:space-between;
    padding:13px var(--space-md);border:none;background:transparent;color:var(--text);
    cursor:pointer;font-size:12px;font-weight:600;font-family:inherit;text-align:left;
    transition:background var(--ease);
  }
  .acc-head:hover{background:var(--surface-raised)}
  .acc-head:focus-visible{outline:2px solid var(--primary);outline-offset:-2px}
  .acc-head .chev{color:var(--text-muted);font-size:12px;transition:transform var(--ease),color var(--ease)}
  .accordion.open .acc-head .chev{transform:rotate(90deg);color:var(--secondary)}
  .acc-body{display:none;padding:0 var(--space-md) var(--space-md);border-top:1px solid var(--border);
    animation:fadeIn var(--ease) both}
  .accordion.open .acc-body{display:block}
  @keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
  .persona-name{font-size:20px;font-weight:700;letter-spacing:-.03em;margin-top:var(--space-sm);color:var(--text)}
  .persona-tag{font-size:12px;color:var(--secondary);margin-top:4px;font-weight:500}
  .persona-blurb{font-size:12px;color:var(--text-muted);margin-top:var(--space-sm);line-height:1.6}
  .sigrow{display:flex;flex-wrap:wrap;gap:var(--space-xs);margin-top:var(--space-sm)}
  .sig{
    background:var(--surface-raised);border:1px solid var(--border);border-radius:10px;
    padding:8px 10px;font-size:10px;color:var(--text-muted);font-weight:500;
  }
  .sig b{display:block;font-size:14px;color:var(--text);font-weight:700;margin-bottom:2px}

  #checkin{display:none}
  #checkin.show{display:block;border-color:var(--glow-soft);box-shadow:var(--shadow-lg)}
  .q{font-weight:600;font-size:14px;margin-bottom:var(--space-sm);letter-spacing:-.02em}
  .flowopts{display:grid;grid-template-columns:repeat(5,1fr);gap:var(--space-xs);margin-bottom:var(--space-sm)}
  .flowopt{
    border:1px solid var(--border);border-radius:10px;padding:8px 4px;text-align:center;
    cursor:pointer;background:var(--surface-raised);
    transition:border-color var(--ease),background var(--ease),transform var(--ease);
  }
  .flowopt:hover{border-color:var(--primary);transform:translateY(-1px)}
  .flowopt.sel{border-color:var(--primary);background:var(--primary-muted);box-shadow:0 0 0 1px var(--primary)}
  .flowopt .emo{font-size:18px;line-height:1}
  .flowopt .lbl{font-size:9px;color:var(--text-muted);margin-top:3px;font-weight:500}
  .scale{margin-bottom:var(--space-sm)}
  .scale .name{font-size:10px;color:var(--text-muted);margin-bottom:var(--space-xs);font-weight:500}
  .pips{display:flex;gap:var(--space-xs)}
  .pip{
    flex:1;text-align:center;padding:7px 0;border-radius:8px;border:1px solid var(--border);
    cursor:pointer;font-size:11px;font-weight:600;background:var(--surface-raised);color:var(--text-muted);
    transition:background var(--ease),border-color var(--ease),color var(--ease);
  }
  .pip:hover{border-color:var(--primary);color:var(--text)}
  .pip.sel{background:var(--primary);color:var(--primary-fg);border-color:var(--primary)}
  .row{display:flex;gap:var(--space-xs)}

  #bootErr{display:none;border-color:rgba(239,68,68,.5)}
  #bootErr.show{display:block}
  #bootErr .card-title{color:var(--error)}
  .muted{color:var(--text-muted)}
  .scope-label{font-weight:500;text-transform:none;letter-spacing:0;color:var(--text-subtle)}
</style>
</head>
<body data-theme="dark">
  <div class="head">
    <div>
      <div class="brand">Flow Intelligence</div>
      <div class="brand-sub">AI collaboration analytics</div>
    </div>
    <div class="head-right">
      <button id="themeToggle" class="iconbtn" title="Toggle theme" aria-label="Toggle theme">◐</button>
      <span class="status"><span id="dot" class="dot"></span><span id="statusText">…</span></span>
    </div>
  </div>

  <div id="syncRow" class="card sync-setup">
    <div class="card-title">Cloud sync</div>
    <p class="sync-hint">Pick one — Personal and Study are different signup paths. Only one can be active.</p>
    <div class="sync-row">
      <button class="btn primary block" id="btnPersonal">Personal</button>
      <button class="btn secondary block" id="btnEnterCode">Enter code</button>
    </div>
    <p class="card-note">Personal = your own analytics. Enter code = research study with a code from your researcher.</p>
  </div>

  <div id="syncOn" class="card sync-active" style="display:none">
    <div class="sync-active-top">
      <div>
        <span class="sync-mode-pill" id="syncModePill">Personal</span>
        <div class="sync-status-line" id="syncStatusLine">Cloud sync active</div>
      </div>
    </div>
    <div class="sync-actions">
      <button class="btn sm secondary" id="btnPauseResume">Pause sync</button>
      <button class="btn sm secondary" id="btnCheckin">Check in</button>
      <button class="btn sm ghost" id="btnDisconnect">Disconnect</button>
    </div>
  </div>

  <div class="card">
    <div class="card-title">This session</div>
    <div class="grid">
      <div class="stat"><div class="v" id="sEdits">0</div><div class="k">edit bursts</div></div>
      <div class="stat"><div class="v" id="sChars">0</div><div class="k">chars written</div></div>
      <div class="stat"><div class="v" id="sFocus">0</div><div class="k">focus switches</div></div>
      <div class="stat"><div class="v" id="sCommits">0</div><div class="k">commits</div></div>
      <div class="stat"><div class="v" id="sAiEst">0</div><div class="k">AI chars (est.)</div></div>
      <div class="stat"><div class="v" id="sLines">0</div><div class="k">lines (est.)</div></div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Overall <span id="overallScope" class="scope-label"></span></div>
    <div class="bar"><div class="ai" id="barAi" style="width:50%"></div><div class="hu" id="barHu" style="width:50%"></div></div>
    <div class="legend">
      <span><span class="sw" style="background:var(--ai)"></span>AI <b id="aiPct">—</b></span>
      <span><span class="sw" style="background:var(--human)"></span>You <b id="huPct">—</b></span>
    </div>
    <div class="grid" style="margin-top:10px">
      <div class="stat"><div class="v" id="oChars">0</div><div class="k">chars written</div></div>
      <div class="stat"><div class="v" id="oPrompts">—</div><div class="k">prompts</div></div>
      <div class="stat"><div class="v" id="oAgent">—</div><div class="k">agent edits</div></div>
      <div class="stat"><div class="v" id="oTab">—</div><div class="k">tab accepts</div></div>
      <div class="stat"><div class="v" id="oVerify">—</div><div class="k">verifications</div></div>
      <div class="stat"><div class="v" id="oFocus">0</div><div class="k">focus switches</div></div>
    </div>
    <div class="card-note" id="overallNote">Local estimates only. Enable cloud sync for measured AI metrics.</div>
  </div>

  <div id="personaAcc" class="accordion">
    <button class="acc-head" id="personaToggle" type="button" aria-expanded="false" aria-controls="personaBody">
      <span>Your collaboration persona</span>
      <span class="chev" aria-hidden="true">▸</span>
    </button>
    <div class="acc-body" id="personaBody">
      <div class="persona-name" id="pName">Warming up</div>
      <div class="persona-tag" id="pTag"></div>
      <div class="persona-blurb" id="pBlurb"></div>
      <div class="sigrow" id="pSigs"></div>
    </div>
  </div>

  <div id="checkin" class="card">
    <div class="q">How's your flow right now?</div>
    <div class="flowopts" id="flowopts"></div>
    <div class="scale"><div class="name">Frustration (optional)</div><div class="pips" id="frus"></div></div>
    <div class="scale"><div class="name">Confidence (optional)</div><div class="pips" id="conf"></div></div>
    <div class="row">
      <button class="btn primary" id="esmSubmit" style="flex:1" disabled>Submit</button>
      <button class="btn secondary" id="esmSkip">Skip</button>
    </div>
  </div>

  <div id="bootErr" class="card"><div class="card-title">Error</div><p class="muted" id="bootErrText"></p></div>

<script nonce="${n}">
(function(){
  const vscode = acquireVsCodeApi();
  const $ = function(id){ return document.getElementById(id); };
  const NL = String.fromCharCode(10);

  function showBootError(err){
    var card = $("bootErr"), text = $("bootErrText");
    if (!card || !text) return;
    card.classList.add("show");
    text.textContent = String(err && err.message ? err.message : err);
  }

  function fmtNum(n){
    if (n === null || n === undefined) return "—";
    if (n >= 10000) return Math.round(n / 1000) + "k";
    if (n >= 1000) return (n / 1000).toFixed(1) + "k";
    return String(n);
  }

  function estLines(chars){
    return Math.max(0, Math.round(chars / 45));
  }

  function bind(id, fn){
    var el = $(id);
    if (el) el.addEventListener("click", fn);
  }

  var checkinTrigger = "manual";
  var sel = { flow: null, frustration: null, confidence: null };
  var cloudSummary = null;

  var FLOW = [
    { v:5, emo:"🔥", lbl:"deep" },
    { v:4, emo:"🙂", lbl:"focused" },
    { v:3, emo:"😐", lbl:"neutral" },
    { v:2, emo:"🌀", lbl:"scattered" },
    { v:1, emo:"😖", lbl:"blocked" },
  ];

  function applyTheme(t){
    document.body.setAttribute("data-theme", t);
  }

  try {
    var saved = vscode.getState() || {};
    var theme = saved.theme || "dark";
    applyTheme(theme);

    bind("themeToggle", function(){
      theme = theme === "dark" ? "light" : "dark";
      applyTheme(theme);
      var prev = vscode.getState() || {};
      vscode.setState(Object.assign({}, prev, { theme: theme }));
    });

    bind("btnPersonal", function(){ vscode.postMessage({ type: "enrollPersonal" }); });
    bind("btnEnterCode", function(){ vscode.postMessage({ type: "enrollStudy" }); });
    bind("btnCheckin", function(){ vscode.postMessage({ type: "checkinNow" }); });
    bind("btnPauseResume", function(){
      vscode.postMessage({ type: lastPaused ? "resumeSync" : "pauseSync" });
    });
    bind("btnDisconnect", function(){ vscode.postMessage({ type: "disconnectSync" }); });

    var lastPaused = false;
    var lastState = { enrolled: false, overall: null };

    bind("personaToggle", function(){
      var open = $("personaAcc").classList.toggle("open");
      $("personaToggle").setAttribute("aria-expanded", open ? "true" : "false");
    });

    function buildCheckin(){
      var fo = $("flowopts");
      fo.innerHTML = "";
      FLOW.forEach(function(o){
        var d = document.createElement("div");
        d.className = "flowopt";
        d.dataset.v = String(o.v);
        d.innerHTML = '<div class="emo">'+o.emo+'</div><div class="lbl">'+o.lbl+'</div>';
        d.addEventListener("click", function(){
          sel.flow = o.v;
          paintFlow();
          $("esmSubmit").disabled = false;
        });
        fo.appendChild(d);
      });
      buildPips("frus", "frustration");
      buildPips("conf", "confidence");
    }

    function buildPips(id, key){
      var el = $(id);
      el.innerHTML = "";
      for (var i = 1; i <= 5; i++) {
        var p = document.createElement("div");
        p.className = "pip";
        p.textContent = String(i);
        p.dataset.v = String(i);
        p.addEventListener("click", function(){
          sel[key] = Number(this.dataset.v);
          paintPips(id, key);
        });
        el.appendChild(p);
      }
    }

    function paintFlow(){
      document.querySelectorAll("#flowopts .flowopt").forEach(function(e){
        e.classList.toggle("sel", Number(e.dataset.v) === sel.flow);
      });
    }

    function paintPips(id, key){
      document.querySelectorAll("#"+id+" .pip").forEach(function(e){
        e.classList.toggle("sel", Number(e.dataset.v) === sel[key]);
      });
    }

    function resetCheckin(){
      sel = { flow: null, frustration: null, confidence: null };
      paintFlow();
      paintPips("frus", "frustration");
      paintPips("conf", "confidence");
      $("esmSubmit").disabled = true;
    }

    function showCheckin(show){
      $("checkin").classList.toggle("show", show);
    }

    bind("esmSubmit", function(){
      if (sel.flow == null) return;
      vscode.postMessage({ type: "esm", trigger: checkinTrigger, flow: sel.flow, frustration: sel.frustration, confidence: sel.confidence });
      showCheckin(false);
      resetCheckin();
    });
    bind("esmSkip", function(){ showCheckin(false); resetCheckin(); });

    function renderSession(live){
      if (!live) return;
      var hu = live.human || {};
      var ai = live.ai_estimate || {};
      var chars = (hu.added_chars || 0) + (ai.added_chars || 0);
      $("sEdits").textContent = fmtNum(hu.edit_bursts || 0);
      $("sChars").textContent = fmtNum(chars);
      $("sFocus").textContent = fmtNum(hu.focus_switches || 0);
      $("sCommits").textContent = fmtNum(hu.commits || 0);
      $("sAiEst").textContent = fmtNum(ai.added_chars || 0);
      $("sLines").textContent = fmtNum(estLines(chars));
    }

    function renderOverallLocal(overall){
      if (!overall) return;
      var hu = overall.human_chars || 0;
      var ai = overall.ai_chars || 0;
      var total = hu + ai;
      var aiPct = total ? Math.round((ai / total) * 100) : 0;
      $("overallScope").textContent = "· " + (overall.scopeLabel || "Last 7 days");
      $("barAi").style.width = aiPct + "%";
      $("barHu").style.width = (100 - aiPct) + "%";
      $("aiPct").textContent = total ? aiPct + "%" : "—";
      $("huPct").textContent = total ? (100 - aiPct) + "%" : "—";
      $("oChars").textContent = fmtNum(total);
      $("oPrompts").textContent = "—";
      $("oAgent").textContent = "—";
      $("oTab").textContent = "—";
      $("oVerify").textContent = "—";
      $("oFocus").textContent = fmtNum(overall.focus_switches || 0);
      $("overallNote").textContent = "Local estimates only. Enable cloud sync for measured AI metrics.";
    }

    function cloudHasData(s){
      if (!s) return false;
      var hu = (s.collaboration && s.collaboration.human_chars) || 0;
      var ai = (s.collaboration && s.collaboration.ai_chars) || 0;
      var prompts = (s.ai && s.ai.prompts) || 0;
      var agent = (s.ai && s.ai.agent_edits) || 0;
      var events = (s.totals && s.totals.events) || 0;
      return events > 0 && (hu + ai > 0 || prompts > 0 || agent > 0);
    }

    function renderOverallCloud(s){
      if (!s || !cloudHasData(s)) return false;
      var hu = s.collaboration.human_chars || 0;
      var ai = s.collaboration.ai_chars || 0;
      var measured = s.collaboration.measured_ai_chars;
      var total = hu + ai;
      var aiPct = total ? Math.round((ai / total) * 100) : 0;
      $("overallScope").textContent = "· All time (cloud)";
      $("barAi").style.width = aiPct + "%";
      $("barHu").style.width = (100 - aiPct) + "%";
      $("aiPct").textContent = total ? aiPct + "%" : "—";
      $("huPct").textContent = total ? (100 - aiPct) + "%" : "—";
      $("oChars").textContent = fmtNum(total);
      $("oPrompts").textContent = fmtNum(s.ai.prompts || 0);
      $("oAgent").textContent = fmtNum(s.ai.agent_edits || 0);
      $("oTab").textContent = fmtNum(s.ai.tab_edits || 0);
      $("oVerify").textContent = fmtNum(s.ai.verifications || 0);
      $("oFocus").textContent = fmtNum(s.human.focus_switches || 0);
      var note = "Measured AI from Cursor hooks.";
      if (measured === 0 && ai > 0) note += " AI chars use local estimate until agent edits are captured.";
      $("overallNote").textContent = note;
      return true;
    }

    function renderOverallEnrolledLocal(overall){
      renderOverallLocal(overall);
      $("overallScope").textContent = "· Last 7 days (local)";
      $("overallNote").textContent = "Cloud sync on — waiting for hook events. Use Cursor Agent, then restart Cursor once if metrics stay empty. Check ~/.cursor/flow-intel/forwarder.log for errors.";
    }

    function renderPersona(m){
      if (!m) return;
      $("pName").textContent = m.name || "Warming up";
      $("pTag").textContent = m.tagline || "";
      $("pBlurb").textContent = m.blurb || "";
      var sig = $("pSigs");
      sig.innerHTML = "";
      (m.signature || []).forEach(function(s){
        var d = document.createElement("div");
        d.className = "sig";
        d.innerHTML = "<b>"+s.value+"</b>"+s.label;
        sig.appendChild(d);
      });
    }

    function setStatus(state){
      var dot = $("dot"), txt = $("statusText");
      dot.className = "dot";
      if (!state.enrolled) {
        dot.classList.add("live");
        txt.textContent = state.sessionActive ? "Local" : "Local only";
        $("syncRow").style.display = "block";
        $("syncOn").style.display = "none";
      } else {
        lastPaused = !state.running;
        dot.classList.add(state.running ? "live" : "paused");
        txt.textContent = state.running ? "Syncing" : "Paused";
        $("syncRow").style.display = "none";
        $("syncOn").style.display = "block";
        $("syncModePill").textContent = state.enrollmentMode === "study" ? "Study" : "Personal";
        $("syncStatusLine").textContent = state.running ? "Cloud sync active" : "Cloud sync paused — data stays local";
        $("btnPauseResume").textContent = state.running ? "Pause sync" : "Resume sync";
        $("btnCheckin").style.display = state.running ? "inline-block" : "none";
      }
    }

    function renderOverall(state){
      if (state.enrolled && cloudSummary && renderOverallCloud(cloudSummary)) return;
      if (state.enrolled) renderOverallEnrolledLocal(state.overall);
      else renderOverallLocal(state.overall);
    }

    window.addEventListener("message", function(ev){
      var m = ev.data;
      if (m.type === "state") {
        lastState = { enrolled: !!m.enrolled, overall: m.overall };
        setStatus(m);
        renderSession(m.live);
        renderOverall(lastState);
        renderPersona(m.mirror);
      } else if (m.type === "summary") {
        cloudSummary = m.summary;
        renderOverall(lastState);
      } else if (m.type === "checkin") {
        checkinTrigger = m.trigger || "manual";
        resetCheckin();
        showCheckin(true);
      }
    });

    buildCheckin();
    vscode.postMessage({ type: "ready" });
  } catch (err) {
    showBootError(err);
  }
})();
</script>
</body>
</html>`;
}
