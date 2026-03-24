/**
 * SRS-2 SHARED SCRIPT — Equilibrium
 * Variáveis a definir em cada página ANTES deste script:
 *   FORM_KEY        : "pre_escolar" | "idade_escolar_feminino" | ...
 *   SRS_ACCENT_VAR  : "--srs-pre-escolar" | ...
 *   DATA_PATH       : caminho para srs2_rules.json (opcional)
 *   URL_DO_GOOGLE_SCRIPT : URL do Apps Script para envio ao Drive
 */

let SRS2_RULES = null;
const $ = (sel) => document.querySelector(sel);

// Caminho para o JSON — pode ser sobrescrito em cada index.html
if (typeof DATA_PATH === "undefined") { var DATA_PATH = "../data/srs2_rules.json"; }

// ─── INICIALIZAÇÃO DAS CORES ─────────────────────────────────────────────────
function aplicarAcento(){
  if(!window.SRS_ACCENT_VAR) return;
  const root = document.documentElement;
  const val = getComputedStyle(root).getPropertyValue(window.SRS_ACCENT_VAR).trim();
  const valLight = getComputedStyle(root).getPropertyValue(window.SRS_ACCENT_VAR + '-light').trim();
  const valDark  = getComputedStyle(root).getPropertyValue(window.SRS_ACCENT_VAR + '-dark').trim();
  if(val)      root.style.setProperty('--srs-accent', val);
  if(valLight) root.style.setProperty('--srs-accent-light', valLight);
  if(valDark)  root.style.setProperty('--srs-accent-dark', valDark);
}

// ─── UTILITÁRIOS ─────────────────────────────────────────────────────────────
function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }

function classificarT(t){
  if(t == null || Number.isNaN(t)) return { label: "—", cls: "" };
  if(t <= 59)  return { label: "Normal",   cls: "cls-normal" };
  if(t <= 65)  return { label: "Leve",     cls: "cls-leve" };
  if(t <= 75)  return { label: "Moderado", cls: "cls-moderado" };
  return             { label: "Severo",   cls: "cls-severo" };
}

function setSubtitle(msg){
  const el = $("#subtitle");
  if(el) el.textContent = msg;
}

// ─── CARREGAR JSON ────────────────────────────────────────────────────────────
async function carregarRegras(){
  const path = (typeof DATA_PATH !== "undefined") ? DATA_PATH : "../data/srs2_rules.json";
  let res;
  try {
    res = await fetch(path, { cache: "no-store" });
  } catch(netErr) {
    throw new Error("Falha de rede ao carregar dados: " + path + "\n" + netErr.message);
  }
  if(!res.ok) throw new Error("Ficheiro não encontrado (" + res.status + "): " + path);
  try {
    SRS2_RULES = await res.json();
  } catch(jsonErr) {
    throw new Error("JSON inválido em: " + path + "\n" + jsonErr.message);
  }
  if(!SRS2_RULES || !Array.isArray(SRS2_RULES.forms)) {
    throw new Error("Formato inesperado em srs2_rules.json — campo 'forms' não encontrado.");
  }
}

function getForm(){
  if(!SRS2_RULES) return null;
  return (SRS2_RULES.forms || []).find(f => f.form === FORM_KEY) || null;
}

// ─── RENDERIZAR ITENS ─────────────────────────────────────────────────────────
function renderItens(){
  const form = getForm();
  const container = $("#itens");
  if(!container) return;
  container.innerHTML = "";

  if(!form){
    container.innerHTML = `<div class="srs-hint" style="color:#dc2626">⚠️ Não foi possível carregar os dados do formulário.<br>Verifique se o ficheiro <b>data/srs2_rules.json</b> está acessível.</div>`;
    return;
  }

  const pillForm = $("#pillForm");
  if(pillForm) pillForm.textContent = form.label || FORM_KEY;
  const hintForm = $("#hintForm");
  if(hintForm) hintForm.textContent = `${form.items.length} itens • ${form.scales.length} escalas`;

  const labels = form.answer_labels || { 1:"Nunca", 2:"Às vezes", 3:"Frequentemente", 4:"Quase sempre" };
  const optLabels = { 1: "Nunca", 2: "Às vezes", 3: "Frequentemente", 4: "Quase sempre" };

  for(const item of form.items){
    const div = document.createElement("div");
    div.className = "item";
    div.dataset.itemId = item.id;

    const reverseTag = item.reverse
      ? `<span class="tag tag-reverso">⇄ reverso</span>`
      : `<span class="tag tag-normal">direto</span>`;

    div.innerHTML = `
      <div class="top">
        <div class="qid">${escapeHtml(item.id)}</div>
        <div class="txt">${escapeHtml(item.text)}</div>
        ${reverseTag}
      </div>
      <div class="opts">
        ${[1,2,3,4].map(v => `
          <label class="opt">
            <input type="radio" name="i${escapeHtml(item.id)}" value="${v}" />
            <span>${v} — ${escapeHtml(labels[v] || optLabels[v] || "")}</span>
          </label>
        `).join("")}
      </div>
    `;

    // Marca item como respondido + atualiza opt selecionada
    div.addEventListener("change", (e) => {
      div.classList.add("respondido");
      div.querySelectorAll(".opt").forEach(o => o.classList.remove("selecionada"));
      e.target.closest(".opt")?.classList.add("selecionada");
      atualizarProgresso();
    });

    container.appendChild(div);
  }
}

// ─── PROGRESSO ────────────────────────────────────────────────────────────────
function atualizarProgresso(){
  const form = getForm();
  if(!form) return;
  let answered = 0;
  for(const item of form.items){
    const r = document.querySelector(`input[name="i${CSS.escape(String(item.id))}"]:checked`);
    if(r) answered++;
  }
  const total = form.items.length;
  const pct = Math.round((answered / total) * 100);
  const pillEl = $("#pillAnswered");
  if(pillEl) pillEl.textContent = `${answered}/${total}`;
  const fill = $(".srs-progress-fill");
  if(fill) fill.style.width = pct + "%";
  // ── Modo Paciente: sincronizar rodapé e barra própria ─────────────────
  const pFill = document.getElementById("patientProgressFill");
  if(pFill) pFill.style.width = pct + "%";
  const fAns = document.getElementById("footerAnswered");
  if(fAns) fAns.textContent = answered;
  const fTot = document.getElementById("footerTotal");
  if(fTot) fTot.textContent = total;
}

// ─── CÁLCULO ──────────────────────────────────────────────────────────────────
function pontosItem(item, resp14){
  const r = parseInt(resp14, 10);
  if(Number.isNaN(r)) return null;
  return item.reverse ? (4 - r) : (r - 1);
}

function coletarRespostas(){
  const form = getForm();
  if(!form) return { respostas: {}, missing: 0 };
  const map = {}; let missing = 0;
  for(const item of form.items){
    const el = document.querySelector(`input[name="i${CSS.escape(String(item.id))}"]:checked`);
    if(!el){ missing++; continue; }
    map[item.id] = parseInt(el.value, 10);
  }
  return { respostas: map, missing };
}

function calcularBrutos(respostasMap){
  const form = getForm();
  if(!form) return {};
  const brutos = {};
  for(const scale of form.scales) brutos[scale.key] = 0;
  for(const item of form.items){
    const resp = respostasMap[item.id];
    if(resp == null) continue;
    const pts = pontosItem(item, resp);
    if(pts == null) continue;
    for(const sKey of item.scales){
      brutos[sKey] += pts;
    }
  }
  return brutos;
}

function calcularTscores(brutos){
  const form = getForm();
  if(!form) return {};
  const ts = {};
  for(const scale of form.scales){
    const bruto = brutos[scale.key];
    const norms = form.norms?.[scale.key] || null;
    if(!norms){ ts[scale.key] = null; continue; }
    const t = norms[String(bruto)];
    ts[scale.key] = (t == null) ? null : Number(t);
  }
  return ts;
}

// ─── TABELAS DE RESULTADO (SIDEBAR) ──────────────────────────────────────────
function renderTabelaResultados(brutos, tscores){
  const form = getForm();
  if(!form) return;
  const tbody = $("#tblResultados tbody");
  if(!tbody) return;
  tbody.innerHTML = "";

  for(const scale of form.scales){
    const bruto = brutos[scale.key];
    const t = tscores[scale.key];
    const { label: clsLabel, cls } = classificarT(t);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div style="font-weight:800;font-size:12px;">${escapeHtml(scale.label || scale.key)}</div>
        <div style="font-size:10px;color:#64748b;">${escapeHtml(scale.key)}</div>
      </td>
      <td class="right nowrap"><b>${bruto ?? "—"}</b></td>
      <td class="right nowrap"><b>${t ?? "—"}</b></td>
      <td><span class="cls-badge ${cls}">${clsLabel}</span></td>
    `;
    tbody.appendChild(tr);
  }
}

function renderTabelaItens(respostasMap){
  const form = getForm();
  if(!form) return;
  const tbody = $("#tblItens tbody");
  if(!tbody) return;
  tbody.innerHTML = "";
  for(const item of form.items){
    const resp = respostasMap[item.id];
    const pts = (resp != null) ? pontosItem(item, resp) : null;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="nowrap">${escapeHtml(item.id)}</td>
      <td class="nowrap">${resp ?? "—"}</td>
      <td class="right nowrap">${pts ?? "—"}</td>
      <td>${item.reverse ? "✓" : "—"}</td>
    `;
    tbody.appendChild(tr);
  }
}

function calcularEExibir(){
  const form = getForm();
  if(!form) return null;
  const { respostas, missing } = coletarRespostas();
  const brutos = calcularBrutos(respostas);
  const tscores = calcularTscores(brutos);
  renderTabelaResultados(brutos, tscores);
  renderTabelaItens(respostas);
  const el = $("#summaryLine");
  if(el){
    const tTotal = tscores["SRS_Total"] ?? tscores["total"] ?? null;
    const { label } = classificarT(tTotal);
    el.textContent = missing > 0
      ? `⚠️ ${missing} item(s) sem resposta — resultado parcial`
      : `✅ Todos os itens respondidos${tTotal != null ? ` · Escore Total T = ${tTotal} (${label})` : ""}`;
  }
  return { brutos, tscores, missing };
}

function limparTudo(){
  document.querySelectorAll("input[type=radio]").forEach(r => r.checked = false);
  document.querySelectorAll(".item").forEach(el => el.classList.remove("respondido"));
  document.querySelectorAll(".opt").forEach(el => el.classList.remove("selecionada"));
  ["#tblResultados tbody","#tblItens tbody"].forEach(s => {
    const el = $(s);
    if(el) el.innerHTML = "";
  });
  const sl = $("#summaryLine");
  if(sl) sl.textContent = 'Preencha os itens e clique em "Recalcular".';
  const fill = $(".srs-progress-fill");
  if(fill) fill.style.width = "0%";
  atualizarProgresso();
}

// ═══════════════════════════════════════════════════════
// RELATÓRIO CLÍNICO
// ═══════════════════════════════════════════════════════

const SCALE_ORDER_HINTS = [
  "Percepção Social",
  "Cognição Social",
  "Comunicação Social",
  "Motivação Social",
  "Padrões Restritos",
  "Comunicação e Interação Social",
  "Escore Total"
];

const SCALE_DESCRIPTIONS = {
  "Percepção Social":
    "Mede a capacidade de reconhecer pistas sociais e lidar com os aspectos perceptivos do comportamento social recíproco. Avalia se o indivíduo consegue identificar nuances nas interações sociais cotidianas.",
  "Cognição Social":
    "Refere-se à capacidade de interpretar as pistas sociais após reconhecê-las. Avalia o aspecto cognitivo-interpretativo do comportamento social recíproco.",
  "Comunicação Social":
    "Mede a capacidade de comunicação expressiva, lidando com os aspectos motores do comportamento social recíproco. Representa os comportamentos mais 'robotizados' da comunicação.",
  "Motivação Social":
    "Avalia o grau em que a pessoa é motivada a se engajar em comportamento sócio interpessoal. Inclui elementos de ansiedade social, inibição e orientação empática.",
  "Padrões Restritos e Repetitivos":
    "Mede a presença de comportamentos estereotípicos característicos de TEA e áreas de interesse muito limitadas. Presente tanto nas subescalas de intervenção quanto nas escalas compatíveis ao DSM-5.",
  "Comunicação e Interação Social":
    "Escala compatível ao DSM-5 que avalia a reciprocidade socioemocional, comportamentos comunicativos não verbais e a capacidade de desenvolver, manter e compreender relacionamentos.",
};

function normalizeStr(s){ return String(s||"").trim().toLowerCase(); }

function sortScalesLikePdf(scales){
  return [...scales].sort((a,b)=>{
    const lA = a.label||a.key, lB = b.label||b.key;
    const iA = SCALE_ORDER_HINTS.findIndex(h=>normalizeStr(lA).includes(normalizeStr(h)));
    const iB = SCALE_ORDER_HINTS.findIndex(h=>normalizeStr(lB).includes(normalizeStr(h)));
    return (iA===-1?999:iA) - (iB===-1?999:iB);
  });
}

function countMissingByScale(form){
  const m = {};
  for(const sc of form.scales) m[sc.key] = 0;
  for(const item of form.items){
    const answered = !!document.querySelector(`input[name="i${CSS.escape(String(item.id))}"]:checked`);
    if(!answered) for(const sKey of item.scales) if(m[sKey]!=null) m[sKey]++;
  }
  return m;
}

// ─── SVG: Perfil ─────────────────────────────────────────────────────────────
function svgProfileChart(rows){
  const W=860, H=420;
  const left=100, right=260, top=50, bottom=40;
  const plotW=W-left-right, plotH=H-top-bottom;
  const tMin=20, tMax=80;

  // Usa CSS variables para respeitar o tema
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--srs-accent').trim() || '#1a56db';
  const accentLight = getComputedStyle(document.documentElement).getPropertyValue('--srs-accent-light').trim() || '#dbeafe';

  function xOfT(t){ return left+((clamp(Number(t),tMin,tMax)-tMin)/(tMax-tMin))*plotW; }
  const yStep = plotH/Math.max(1,rows.length);
  function yOfI(i){ return top+(i+0.5)*yStep; }

  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="auto" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif">
    <rect x="0" y="0" width="${W}" height="${H}" fill="#fff" rx="12"/>`;

  // Fundo da área de plot
  svg += `<rect x="${xOfT(20)}" y="${top}" width="${xOfT(80)-xOfT(20)}" height="${plotH}" fill="#f8fafc" rx="4"/>`;

  // Zona Normal (40-60) destacada
  svg += `<rect x="${xOfT(40)}" y="${top}" width="${xOfT(60)-xOfT(40)}" height="${plotH}" fill="${accentLight}" opacity="0.5" rx="2"/>`;
  
  // Zonas de alerta
  svg += `<rect x="${xOfT(60)}" y="${top}" width="${xOfT(65)-xOfT(60)}" height="${plotH}" fill="#fef9c3" opacity="0.7"/>`;
  svg += `<rect x="${xOfT(65)}" y="${top}" width="${xOfT(75)-xOfT(65)}" height="${plotH}" fill="#fed7aa" opacity="0.7"/>`;
  svg += `<rect x="${xOfT(75)}" y="${top}" width="${xOfT(80)-xOfT(75)}" height="${plotH}" fill="#fecaca" opacity="0.7"/>`;

  // Linhas verticais de grade
  for(let t=20;t<=80;t+=5){
    const x=xOfT(t);
    svg += `<line x1="${x}" y1="${top}" x2="${x}" y2="${top+plotH}" stroke="#e2e8f0" stroke-width="1.5"/>`;
    let lbl = String(t);
    if(t===50) lbl = "50 (M)";
    svg += `<text x="${x}" y="${top-12}" text-anchor="middle" font-size="11" fill="#64748b" font-weight="${t===50?'700':'400'}">${lbl}</text>`;
  }

  // Labels de zona
  svg += `<text x="${xOfT(50)}" y="${top-28}" text-anchor="middle" font-size="10" fill="${accent}" font-weight="700">NORMAL</text>`;
  svg += `<text x="${xOfT(62)}" y="${top-28}" text-anchor="middle" font-size="10" fill="#a16207" font-weight="700">LEVE</text>`;
  svg += `<text x="${xOfT(70)}" y="${top-28}" text-anchor="middle" font-size="10" fill="#c2410c" font-weight="700">MOD</text>`;
  svg += `<text x="${xOfT(77)}" y="${top-28}" text-anchor="middle" font-size="10" fill="#991b1b" font-weight="700">SEV</text>`;

  // Headers laterais
  svg += `<text x="10" y="${top-12}" font-size="10" fill="#64748b" font-weight="700">Bruto</text>`;
  svg += `<text x="48" y="${top-12}" font-size="10" fill="#64748b" font-weight="700">T</text>`;

  // Linhas horizontais de separação
  rows.forEach((_,i)=>{
    svg += `<line x1="${xOfT(20)}" y1="${yOfI(i)+yStep/2}" x2="${xOfT(80)}" y2="${yOfI(i)+yStep/2}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3,3"/>`;
  });

  // Linha conectando pontos
  let path = "";
  rows.forEach((r,i)=>{
    const x=xOfT(r.t??50), y=yOfI(i);
    path += (i===0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
  });
  svg += `<path d="${path}" fill="none" stroke="${accent}" stroke-width="2.5" stroke-linejoin="round"/>`;

  // Pontos e labels
  rows.forEach((r,i)=>{
    const y=yOfI(i), x=xOfT(r.t??50);
    const t = r.t==null ? null : Number(r.t);
    const color = t==null ? '#94a3b8' : t<=59 ? '#16a34a' : t<=65 ? '#d97706' : t<=75 ? '#ea580c' : '#dc2626';

    // Valores numéricos
    svg += `<text x="10" y="${y+4}" font-size="11" fill="#374151" font-weight="700">${r.bruto??'—'}</text>`;
    svg += `<text x="48" y="${y+4}" font-size="11" fill="#374151" font-weight="700">${r.t??'—'}</text>`;

    // Ponto colorido
    svg += `<circle cx="${x}" cy="${y}" r="7" fill="${color}" stroke="#fff" stroke-width="2"/>`;
    svg += `<circle cx="${x}" cy="${y}" r="3" fill="#fff"/>`;

    // Nome à direita
    const label = r.label.length > 30 ? r.label.slice(0,28)+'…' : r.label;
    svg += `<text x="${xOfT(80)+14}" y="${y+4}" font-size="12" fill="#1e293b" font-weight="700">${escapeHtml(label)}</text>`;
  });

  svg += `</svg>`;
  return svg;
}

// ─── SVG: Sino ───────────────────────────────────────────────────────────────
function svgBell(t){
  const W=400, H=130;
  const tMin=20, tMax=80;
  const xPad=20, baseY=H-28, plotW=W-xPad*2;

  const accent = getComputedStyle(document.documentElement).getPropertyValue('--srs-accent').trim() || '#1a56db';
  const accentLight = getComputedStyle(document.documentElement).getPropertyValue('--srs-accent-light').trim() || '#dbeafe';

  function xOfT(val){ return xPad+((clamp(Number(val),tMin,tMax)-tMin)/(tMax-tMin))*plotW; }

  const pts = [];
  for(let i=0;i<=80;i++){
    const u=i/80, x=xPad+u*plotW;
    const y = baseY - Math.exp(-Math.pow((u-0.5)/0.22,2))*90;
    pts.push([x,y]);
  }
  const d = pts.map((p,i)=>(i===0?`M ${p[0]} ${p[1]}`:`L ${p[0]} ${p[1]}`)).join(" ")
    + ` L ${xPad+plotW} ${baseY} L ${xPad} ${baseY} Z`;

  const tv = t ?? 50;
  const xt = xOfT(tv);
  const color = tv<=59 ? '#16a34a' : tv<=65 ? '#d97706' : tv<=75 ? '#ea580c' : '#dc2626';

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="auto" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="#fff" rx="8"/>
    <path d="${d}" fill="${accentLight}" opacity="0.6"/>
    <rect x="${xOfT(40)}" y="${baseY-90}" width="${xOfT(60)-xOfT(40)}" height="90" fill="${accent}" opacity="0.12" rx="2"/>
    <line x1="${xt}" y1="${baseY-90}" x2="${xt}" y2="${baseY}" stroke="${color}" stroke-width="2.5"/>
    <circle cx="${xt}" cy="${baseY-90}" r="5" fill="${color}"/>
    <circle cx="${xt}" cy="${baseY-90}" r="2" fill="#fff"/>
    <line x1="${xPad}" y1="${baseY}" x2="${xPad+plotW}" y2="${baseY}" stroke="#94a3b8" stroke-width="1.5"/>
    ${[20,30,40,50,60,70,80].map(v=>`
      <text x="${xOfT(v)}" y="${baseY+16}" text-anchor="middle" font-size="10" fill="#64748b">${v}</text>
    `).join("")}
    <text x="${xt}" y="${baseY-95}" text-anchor="middle" font-size="10" fill="${color}" font-weight="800">T=${tv??'—'}</text>
  </svg>`;
}

// ─── TEXTOS ───────────────────────────────────────────────────────────────────
function buildInterpretation(){
  return [
    { cls: "normal",   range: "T ≤ 59 — Dentro dos limites normais",
      text: "Pontuações geralmente não associadas ao TEA. Indivíduos com autismo muito leve podem mostrar pontuações na extremidade superior do nível normal quando bem ajustados e com funcionalidade adaptativa relativamente intacta." },
    { cls: "leve",     range: "T 60–65 — Nível leve",
      text: "Indicam prejuízos clinicamente significativos com interferência leve a moderada nas interações sociais. Comuns em quadros do espectro autista e, ocasionalmente, em TDAH mais severo. Para pré-escolares, considerar Transtorno Específico de Linguagem (TEL) ou deficiência intelectual." },
    { cls: "moderado", range: "T 66–75 — Nível moderado",
      text: "Indicam prejuízos clinicamente significativos com interferência substancial nas interações. Típicos em TEA de gravidade moderada, incluindo diagnósticos DSM-IV (Autismo, TGD-SOE, Asperger) e DSM-5 (TEA, Transtorno de Comunicação Social)." },
    { cls: "severo",   range: "T ≥ 76 — Nível severo",
      text: "Indicam prejuízos clinicamente severos com interferência marcante nas interações diárias. Fortemente associados a Transtorno do Autismo, Síndrome de Asperger e TGD-SOE mais severos. É comum que pontuações se atenuem entre a idade pré-escolar e escolar." }
  ];
}

// ─── PREENCHER E ABRIR RELATÓRIO ─────────────────────────────────────────────
function abrirRelatorio(result){
  const form = getForm();
  if(!form) return;

  const scalesSorted = sortScalesLikePdf(form.scales);
  const missingByScale = countMissingByScale(form);
  const rows = scalesSorted.map(sc=>({
    key: sc.key, label: sc.label||sc.key,
    bruto: result.brutos?.[sc.key],
    t: result.tscores?.[sc.key]
  }));

  const paciente  = ($("#paciente")?.value || "—");
  const data      = ($("#data")?.value || "—");
  const avaliador = ($("#avaliador")?.value || "—");
  const formLabel = form.label || FORM_KEY;

  // Escore total (última escala ou busca por key)
  const totalRow = rows.find(r=>normalizeStr(r.label).includes("total")) || rows[rows.length-1];
  const tTotal = totalRow?.t;
  const { label: clsTotal, cls: clsCSS } = classificarT(tTotal);

  const overlay = $("#repOverlay");
  if(!overlay) return;

  // Seções por escala
  const scaleSections = rows.map(r=>{
    const t = r.t==null ? null : Number(r.t);
    const ciA = t==null ? "—" : clamp(t-4,20,80);
    const ciB = t==null ? "—" : clamp(t+4,20,80);
    const missing = missingByScale[r.key]??0;
    const descKey = SCALE_ORDER_HINTS.find(h=>normalizeStr(r.label).includes(normalizeStr(h)))||r.label;
    const desc = SCALE_DESCRIPTIONS[descKey]||"";
    const { label: clsLbl, cls: clsCl } = classificarT(t);
    return `
    <div class="rep-scale-card">
      <div class="rep-scale-card-header">
        <span class="rep-scale-card-title">${escapeHtml(r.label)}</span>
        <span class="cls-badge ${clsCl}">${clsLbl}</span>
      </div>
      <div class="rep-scale-card-body">
        <div>
          <table class="rep-scale-mini-table">
            <tr><td>Pontuação bruta</td><td>${r.bruto??'—'}</td></tr>
            <tr><td>Escore T</td><td>${r.t??'—'}</td></tr>
            <tr><td>Itens sem resposta</td><td>${missing}</td></tr>
            <tr><td>Intervalo de confiança (±4)</td><td>[${ciA} – ${ciB}]</td></tr>
          </table>
        </div>
        <div>${svgBell(t)}</div>
        ${desc ? `<div class="rep-scale-desc">${escapeHtml(desc)}</div>` : ''}
      </div>
    </div>`;
  }).join("");

  // Cards de interpretação
  const interpCards = buildInterpretation().map(i=>`
    <div class="rep-interp-card ${i.cls}">
      <div class="rep-interp-badge">${i.range.split('—')[0].trim()}</div>
      <div class="rep-interp-range">${i.range.split('—')[1]?.trim()||''}</div>
      <div class="rep-interp-text">${i.text}</div>
    </div>`).join("");

  // Tabela de scores resumo
  const scoreRows = rows.map(r=>{
    const {label:clsLbl, cls:clsCls} = classificarT(r.t);
    const isTotal = normalizeStr(r.label).includes("total");
    return `<tr class="${isTotal?'row-total':''}">
      <td><b>${escapeHtml(r.label)}</b></td>
      <td>${r.bruto??'—'}</td>
      <td>${r.t??'—'}</td>
      <td><span class="cls-badge ${clsCls}">${clsLbl}</span></td>
    </tr>`;
  }).join("");

  const html = `
  <div class="rep-wrapper">
    <div class="rep-header">
      <div class="rep-header-brand">
        <img src="../logo.png" alt="Equilibrium" class="rep-logo">
        <div>
          <div class="rep-brand-name">Equilibrium</div>
          <div class="rep-brand-sub">Neuropsicologia</div>
        </div>
      </div>
      <div class="rep-header-info">
        <div class="rep-test-name">SRS-2 — Escala de Responsividade Social</div>
        <div class="rep-test-sub">${escapeHtml(formLabel)}</div>
      </div>
    </div>

    <div class="rep-patient-strip">
      <div class="rep-patient-field">
        <label>Paciente</label>
        <span>${escapeHtml(paciente)}</span>
      </div>
      <div class="rep-patient-field">
        <label>Data de Avaliação</label>
        <span>${escapeHtml(data)}</span>
      </div>
      <div class="rep-patient-field">
        <label>Avaliador</label>
        <span>${escapeHtml(avaliador)}</span>
      </div>
      ${tTotal != null ? `
      <div class="rep-patient-field">
        <label>Resultado Geral</label>
        <span><span class="cls-badge ${clsCSS}" style="font-size:13px;">${clsTotal} (T=${tTotal})</span></span>
      </div>` : ''}
    </div>

    <div class="rep-body">

      <div class="rep-section">
        <div class="rep-section-title">Perfil de Escores T</div>
        <div class="rep-chart-wrap">${svgProfileChart(rows)}</div>
      </div>

      <div class="rep-section">
        <div class="rep-section-title">Tabela de Resultados</div>
        <table class="rep-scores-table">
          <thead>
            <tr>
              <th>Escala</th>
              <th>Bruto</th>
              <th>Escore T</th>
              <th>Classificação</th>
            </tr>
          </thead>
          <tbody>${scoreRows}</tbody>
        </table>
      </div>

      <div class="rep-section">
        <div class="rep-section-title">Detalhamento por Escala</div>
        ${scaleSections}
      </div>

      <div class="rep-section">
        <div class="rep-section-title">Interpretação Clínica do Escore T</div>
        <div class="rep-interp-grid">${interpCards}</div>
      </div>

    </div>

    <div class="rep-footer">
      <span>Equilibrium Neuropsicologia · Correção automatizada SRS-2</span>
      <span>Gerado em ${new Date().toLocaleDateString('pt-BR')}</span>
    </div>
  </div>`;

  const frame = overlay.querySelector(".srs-report-frame");
  if(frame) frame.innerHTML = html;
  overlay.classList.add("ativo");
}

// ─── MODAL DE LOADING ─────────────────────────────────────────────────────────
function mostrarModalGerandoRelatorio(callback){
  const modal = $("#modalGerando");
  if(!modal){ callback(); return; }
  modal.classList.add("ativo");
  setTimeout(()=>{
    modal.classList.remove("ativo");
    callback();
  }, 1100);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  aplicarAcento();

  try {
    setSubtitle("Carregando regras…");
    await carregarRegras();
    const form = getForm();
    if(!form){
      setSubtitle(`ERRO: FORM_KEY inválida (${FORM_KEY})`);
    } else {
      setSubtitle(form.label || FORM_KEY);
    }

    // Data padrão = hoje
    const today = new Date().toISOString().slice(0,10);
    const dataEl = $("#data");
    if(dataEl) dataEl.value = today;

    renderItens();
    atualizarProgresso();

    $("#btnRecalc")?.addEventListener("click", ()=>{ calcularEExibir(); });
    $("#btnClear")?.addEventListener("click", ()=>{ limparTudo(); });

    // Botão Relatório
    $("#btnRelatorio")?.addEventListener("click", ()=>{
      const result = calcularEExibir();
      if(!result) return;
      mostrarModalGerandoRelatorio(()=>{ abrirRelatorio(result); });
    });

    // Botão Imprimir (dentro do overlay)
    $("#btnPrintRep")?.addEventListener("click", ()=>{ window.print(); });

    // Botão Fechar overlay
    $("#btnCloseRep")?.addEventListener("click", ()=>{
      $("#repOverlay")?.classList.remove("ativo");
    });

    // ── MODO PACIENTE: Botão Enviar Respostas ──────────────────────────────
    $("#btnEnviar")?.addEventListener("click", () => finalizarEEnviar());

  } catch(err){
    console.error(err);
    setSubtitle("Falha ao carregar regras.");
    const container = $("#itens");
    if(container) container.innerHTML = `
      <div class="srs-hint" style="color:#dc2626">
        Erro: ${escapeHtml(err.message || String(err))}<br><br>
        Confira se o arquivo existe em: <b>../data/srs2_rules.json</b>
      </div>`;
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// MODO PACIENTE — Envio ao Google Drive
// Requer: URL_DO_GOOGLE_SCRIPT definida na página antes deste script.
//         html2pdf.js carregado (CDN) antes deste script.
// ══════════════════════════════════════════════════════════════════════════════

async function finalizarEEnviar() {

  // ── 1. Calcular scores ────────────────────────────────────────────────────
  const result = calcularEExibir();
  if (!result) return;
  const form = getForm();
  if (!form) return;

  // ── 2. Gerar HTML do relatório num contentor de renderização ──────────────
  //    Usamos um div FORA do ecrã horizontalmente (left: -9999px) mas com
  //    posição absolute (não fixed) para que o browser possa calcular a altura
  //    completa do documento sem corte. O html2canvas consegue capturar
  //    elementos fora do viewport se usarmos o método .from() com a opção
  //    windowWidth e height explícita calculada pelo scrollHeight.
  abrirRelatorio(result);

  const repFrame = document.querySelector("#repOverlay .srs-report-frame");
  if (!repFrame || !repFrame.innerHTML.trim()) {
    alert("Erro interno: relatório vazio. Tente novamente.");
    return;
  }

  // ── 3. Contentor de captura (invisível ao paciente) ───────────────────────
  const captureWrap = document.createElement("div");
  captureWrap.id = "__srs2_capture__";
  captureWrap.style.cssText = [
    "position:absolute",   // absolute, não fixed — sem corte de altura
    "top:0",
    "left:-9999px",        // fora do ecrã lateralmente
    "width:794px",         // largura A4 a 96dpi
    "background:#fff",
    "font-family:'DM Sans',Arial,sans-serif",
    "z-index:0",
    "pointer-events:none"
  ].join(";");

  captureWrap.innerHTML = repFrame.innerHTML;
  document.body.appendChild(captureWrap);

  // Pausa para o browser calcular layout (scrollHeight) do captureWrap
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 100)));

  const captureHeight = captureWrap.scrollHeight;

  // ── 4. Mostrar cortina (só agora — o layout já está calculado) ────────────
  const btnEnviar = document.getElementById("btnEnviar");
  if (btnEnviar) { btnEnviar.disabled = true; btnEnviar.textContent = "A processar…"; }

  const cortina = document.createElement("div");
  cortina.id = "__srs2_cortina__";
  cortina.style.cssText = [
    "position:fixed","inset:0",
    "background:linear-gradient(145deg,#f0f4ff 0%,#ede9fe 100%)",
    "z-index:999999",
    "display:flex","flex-direction:column",
    "align-items:center","justify-content:center","gap:18px"
  ].join(";");
  cortina.innerHTML = `
    <div style="font-size:52px;animation:srs2pulse 1.5s ease-in-out infinite">⏳</div>
    <div id="__srs2_msg__" style="font-size:21px;font-weight:800;color:#3730a3;text-align:center;padding:0 20px">A processar as suas respostas…</div>
    <div style="font-size:14px;color:#6d28d9;text-align:center">Por favor, não feche esta página.</div>
    <style>@keyframes srs2pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}</style>
  `;
  document.body.appendChild(cortina);

  // Pausa para o browser pintar a cortina
  await new Promise(r => setTimeout(r, 120));

  const setMsg = (txt) => {
    const el = document.getElementById("__srs2_msg__");
    if (el) el.textContent = txt;
  };

  let tempDiv;
  try {

    // ── 5. Mover conteúdo para div renderizável COM dimensões exactas ─────
    //    Agora que a cortina está visível, podemos tornar o div visível
    //    (left:0) para o html2canvas capturar correctamente.
    captureWrap.style.left = "0";
    captureWrap.style.top  = "0";

    // Pausa extra para repintura
    await new Promise(r => setTimeout(r, 150));

    setMsg("A formatar o relatório em PDF…");

    const opt = {
      margin: [8, 0, 8, 0],
      filename: "resultado.pdf",
      image: { type: "jpeg", quality: 0.97 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0,
        width:  794,
        height: captureHeight,
        windowWidth:  794,
        windowHeight: captureHeight,
        logging: false
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
    };

    const pdfUri = await html2pdf().set(opt).from(captureWrap).outputPdf("datauristring");

    // Remove div de captura
    document.body.removeChild(captureWrap);

    // ── 6. Enviar ao Drive ─────────────────────────────────────────────────
    setMsg("A enviar com segurança…");

    const base64 = pdfUri.split(",")[1];
    const nomePaciente = (document.getElementById("paciente")?.value?.trim() || "Paciente_Sem_Nome");
    const formKey      = (typeof FORM_KEY !== "undefined" ? FORM_KEY : "srs2");
    const urlScript    = (typeof URL_DO_GOOGLE_SCRIPT !== "undefined") ? URL_DO_GOOGLE_SCRIPT : null;

    if (!urlScript) throw new Error("URL_DO_GOOGLE_SCRIPT não definida na página.");

    const res  = await fetch(urlScript, {
      method: "POST",
      body: JSON.stringify({ pdf: base64, nome: nomePaciente, form: formKey })
    });
    const data = await res.json();

    if (data.status === "sucesso") {
      document.body.innerHTML = `
        <div class="success-screen">
          <div class="success-card">
            <div class="s-icon">✅</div>
            <h1>Avaliação Finalizada!</h1>
            <p>As suas respostas foram processadas e enviadas com segurança.</p>
            <p class="s-note">Já pode fechar esta janela.</p>
          </div>
        </div>
      `;
    } else {
      throw new Error(data.mensagem || "Resposta inesperada do servidor.");
    }

  } catch (err) {
    console.error("Erro ao enviar:", err);
    const cw = document.getElementById("__srs2_capture__");
    if (cw && cw.parentNode) document.body.removeChild(cw);
    const ct = document.getElementById("__srs2_cortina__");
    if (ct) ct.remove();
    if (btnEnviar) { btnEnviar.disabled = false; btnEnviar.textContent = "📤 Enviar Respostas"; }
    alert("Não foi possível enviar as respostas.\n\nVerifique a sua ligação à internet e tente novamente.\n\nDetalhe: " + err.message);
  }
}
