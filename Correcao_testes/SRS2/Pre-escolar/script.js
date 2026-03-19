// Cole a URL gigante gerada pelo Google Apps Script entre as aspas:
const URL_DO_GOOGLE_SCRIPT = "https://script.google.com/macros/s/AKfycbwBUzlAykhgVOjW9HKAKGjXkgnA8SkjRdgGk5CstrM-uMYkSxAbHEQHieb2N29etYY7/exec";

/**
 * TROQUE SOMENTE ISSO EM CADA PASTA
 */
const FORM_KEY = "pre_escolar";
// Exemplos:
// "pre_escolar"
// "idade_escolar_feminino"
// "idade_escolar_masculino"
// "adulto_autorrelato"
// "adulto_heterorrelato"

let SRS2_RULES = null;

const $ = (sel) => document.querySelector(sel);

function setSubtitle(msg){
  $("#subtitle").textContent = msg;
}

async function carregarRegras(){
  // Esta página está em /SRS2/<pasta>/index.html
  // então o JSON fica em /SRS2/data/srs2_rules.json -> "../data/srs2_rules.json"
  const res = await fetch("../data/srs2_rules.json", { cache: "no-store" });
  if(!res.ok){
    throw new Error("Não foi possível carregar ../data/srs2_rules.json");
  }
  SRS2_RULES = await res.json();
}

function getForm(){
  if(!SRS2_RULES) return null;
  return (SRS2_RULES.forms || []).find(f => f.form === FORM_KEY) || null;
}

function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function renderItens(){
  const form = getForm();
  const container = $("#itens");
  container.innerHTML = "";

  if(!form){
    container.innerHTML = `<div class="small">FORM_KEY inválida: <b>${escapeHtml(FORM_KEY)}</b></div>`;
    return;
  }

  $("#pillForm").textContent = form.label || FORM_KEY;
  $("#hintForm").textContent = `Itens: ${form.items.length} • Escalas: ${form.scales.length}`;

  const labels = form.answer_labels || {
    1: "Nunca",
    2: "Às vezes",
    3: "Frequentemente",
    4: "Quase sempre"
  };

  for(const item of form.items){
    const div = document.createElement("div");
    div.className = "item";

    const reverseTag = item.reverse
      ? `<span class="tag">reverso</span>`
      : `<span class="tag">normal</span>`;

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
            <span>${v} — ${escapeHtml(labels[v] || "")}</span>
          </label>
        `).join("")}
      </div>
    `;

    div.addEventListener("change", () => {
      atualizarContagemRespondidos();
    });

    container.appendChild(div);
  }
}

function atualizarContagemRespondidos(){
  const form = getForm();
  if(!form) return;

  let answered = 0;
  for(const item of form.items){
    const resp = document.querySelector(`input[name="i${CSS.escape(String(item.id))}"]:checked`);
    if(resp) answered++;
  }
  $("#pillAnswered").textContent = String(answered);
}

// Excel: normal -> resp-1 ; reverso -> 4-resp
function pontosItem(item, resp14){
  const r = parseInt(resp14, 10);
  if(Number.isNaN(r)) return null;
  return item.reverse ? (4 - r) : (r - 1);
}

function coletarRespostas(){
  const form = getForm();
  const map = {};
  let missing = 0;

  for(const item of form.items){
    const sel = `input[name="i${CSS.escape(String(item.id))}"]:checked`;
    const el = document.querySelector(sel);
    if(!el){
      missing++;
      continue;
    }
    map[item.id] = parseInt(el.value, 10);
  }

  return { respostas: map, missing };
}

function calcularBrutos(respostasMap){
  const form = getForm();

  const brutos = {};
  for(const scale of form.scales){
    brutos[scale.key] = 0;
  }

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
  const ts = {};

  for(const scale of form.scales){
    const bruto = brutos[scale.key];
    const norms = form.norms?.[scale.key] || null;

    if(!norms){
      ts[scale.key] = null;
      continue;
    }

    const t = norms[String(bruto)];
    ts[scale.key] = (t == null) ? null : Number(t);
  }

  return ts;
}

function classificarT(t){
  if(t == null || Number.isNaN(t)) return "—";
  if(t <= 59) return "Normal";
  if(t <= 65) return "Leve";
  if(t <= 75) return "Moderado";
  return "Severo";
}

function renderTabelaResultados(brutos, tscores){
  const form = getForm();
  const tbody = $("#tblResultados tbody");
  tbody.innerHTML = "";

  for(const scale of form.scales){
    const bruto = brutos[scale.key];
    const t = tscores[scale.key];
    const cls = classificarT(t);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div style="font-weight:800;color:#e5e7eb">${escapeHtml(scale.label || scale.key)}</div>
        <div class="small">${escapeHtml(scale.key)}</div>
      </td>
      <td class="right nowrap">${bruto ?? "—"}</td>
      <td class="right nowrap">${t ?? "—"}</td>
      <td class="nowrap">${escapeHtml(cls)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderTabelaItens(respostasMap){
  const form = getForm();
  const tbody = $("#tblItens tbody");
  tbody.innerHTML = "";

  for(const item of form.items){
    const resp = respostasMap[item.id];
    const pts = (resp == null) ? null : pontosItem(item, resp);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="nowrap">${escapeHtml(item.id)}</td>
      <td class="nowrap">${resp ?? "—"}</td>
      <td class="right nowrap">${pts ?? "—"}</td>
      <td class="nowrap">${item.reverse ? "sim" : "não"}</td>
    `;
    tbody.appendChild(tr);
  }
}

function calcularEExibir(){
  const form = getForm();
  if(!form) return;

  const { respostas, missing } = coletarRespostas();
  const brutos = calcularBrutos(respostas);
  const tscores = calcularTscores(brutos);

  renderTabelaResultados(brutos, tscores);
  //renderTabelaItens(respostas);

  const total = form.items.length;
  const answered = total - missing;
  $("#summaryLine").textContent = `Respondidos: ${answered}/${total} • Faltando: ${missing}`;

  return { respostas, brutos, tscores, missing };
}

function limparTudo(){
  const form = getForm();
  if(!form) return;

  for(const item of form.items){
    const els = document.querySelectorAll(`input[name="i${CSS.escape(String(item.id))}"]`);
    els.forEach(el => el.checked = false);
  }

  atualizarContagemRespondidos();
  $("#tblResultados tbody").innerHTML = "";
  $("#tblItens tbody").innerHTML = "";
  $("#summaryLine").textContent = "Preencha os itens e clique em “Recalcular”.";
}

document.addEventListener("DOMContentLoaded", async () => {
  try{
    setSubtitle("Carregando regras…");
    await carregarRegras();

    const form = getForm();
    if(!form){
      setSubtitle(`ERRO: FORM_KEY inválida (${FORM_KEY})`);
    }else{
      setSubtitle(form.label || FORM_KEY);
    }

    // default data = hoje
    const today = new Date();
    $("#data").value = today.toISOString().slice(0,10);

    renderItens();
    atualizarContagemRespondidos();

$("#btnRecalc").addEventListener("click", () => {
      calcularEExibir();
    });

    $("#btnClear").addEventListener("click", () => {
      limparTudo();
    });
    
    // Inicia a escuta do botão de enviar
    instalarBotaoEnviar();

  }catch(err){
    console.error(err);
    setSubtitle("Falha ao carregar regras.");

    const container = $("#itens");
    container.innerHTML = `
      <div class="small" style="color:#fca5a5">
        Erro: ${escapeHtml(err.message || String(err))}
        <br><br>
        Confira se o arquivo existe em: <b>../data/srs2_rules.json</b>
      </div>
    `;
  }
});

// ------------------------------
// RELATÓRIO (PRINT) – GERAÇÃO
// ------------------------------

// Ordem “igual ao PDF” (por label). Ajusta sozinho mesmo se keys mudarem.
const SCALE_ORDER_HINTS = [
  "Percepção Social",
  "Cognição Social",
  "Comunicação Social",
  "Motivação Social",
  "Padrões Restritos",
  "Comunicação e Interação Social",
  "Escore Total"
];

// Textos descritivos (paráfrase clínica; você pode refinar depois)
const SCALE_DESCRIPTIONS = {
  "Percepção Social":
    "A Subescala de Intervenção de Percepção Social mede a capacidade de reconhecer pistas sociais e lidar com os aspectos da percepção do comportamento social recíproco.",
  "Cognição Social":
    "A Subescala de Intervenção Cognição Social refere-se à capacidade de interpretar as pistas sociais após reconhecê-las e lidar com o aspecto cognitivo-interpretativo do comportamento social recíproco.",
  "Comunicação Social":
    "A Subescala de Intervenção Comunicação Social mede a capacidade de comunicação expressiva, lidando com os aspectos motores do comportamento social recíproco. Esta categoria representa os aspectos \"robotizados\" do comportamento.",
  "Motivação Social":
    "A Subescala de Intervenção Motivação Social refere-se ao grau em que as pessoas geralmente são motivadas a se engajar em comportamento sócio interpessoal. Elementos de ansiedade social, inibição e orientação empática estão incluídos entre esses itens.",
  "Padrões Restritos e Repetitivos":
    "Padrões Restritos e Repetitivos encontra-se tanto nas subescalas de intervenção quanto nas escalas compatíveis ao DSM-5. Esta categoria mede a presença de comportamentos estereotípicos característicos de TEA e áreas de interesse muito limitadas.",
  "Comunicação e Interação Social":
    "Comunicação e Interação Social é uma das escalas compatíveis ao DSM-5 e é uma medida global que se relaciona tanto à capacidade de reconhecer e interpretar sinais sociais quanto à capacidade de motivação para o contato interpessoal social expressivo. Ela avalia a reciprocidade socioemocional, comportamentos comunicativos não verbais usados para interação social e capacidade de desenvolver, manter e compreender relacionamentos."
};

function normalizeStr(s){
  return String(s || "").trim().toLowerCase();
}

function sortScalesLikePdf(scales){
  const scored = scales.map(sc => {
    const lbl = sc.label || sc.key;
    const idx = SCALE_ORDER_HINTS.findIndex(h => normalizeStr(lbl).includes(normalizeStr(h)));
    return { sc, idx: (idx === -1 ? 999 : idx) };
  });
  scored.sort((a,b) => a.idx - b.idx);
  return scored.map(x => x.sc);
}

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function countMissingByScale(form){
  // missing por escala = itens sem resposta que pertencem àquela escala
  const missingByScale = {};
  for(const sc of form.scales) missingByScale[sc.key] = 0;

  for(const item of form.items){
    const sel = document.querySelector(`input[name="i${CSS.escape(String(item.id))}"]:checked`);
    const answered = !!sel;
    if(answered) continue;

    for(const sKey of item.scales){
      if(missingByScale[sKey] != null) missingByScale[sKey] += 1;
    }
  }
  return missingByScale;
}

// --- SVG: Perfil (linha com pontos) ---
function svgProfileChart(rows){
  const W = 920, H = 450;
  const left = 100, right = 280, top = 40, bottom = 40;
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  const tMin = 20, tMax = 80;

  function xOfT(t){
    const tt = clamp(Number(t), tMin, tMax);
    return left + ((tt - tMin) / (tMax - tMin)) * plotW;
  }
  const yStep = plotH / Math.max(1, rows.length);
  function yOfI(i){ return top + (i + 0.5) * yStep; }

  // Cores originais do PDF Hogrefe
  const bgCyan = "#e8fbfa"; // Verde-água/ciano claro do fundo
  const grayLight = "#dcdcdc";
  const grayMed = "#c8c8c8";
  const grayDark = "#b4b4b4";

  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="auto" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>`;

  // Fundo Verde-água total
  svg += `<rect x="${xOfT(20)}" y="${top}" width="${xOfT(80)-xOfT(20)}" height="${plotH}" fill="${bgCyan}" />`;

  // Faixas Cinzas Normativas (40 a 60, etc)
  svg += `<rect x="${xOfT(40)}" y="${top}" width="${xOfT(45)-xOfT(40)}" height="${plotH}" fill="${grayLight}" />`;
  svg += `<rect x="${xOfT(45)}" y="${top}" width="${xOfT(55)-xOfT(45)}" height="${plotH}" fill="${grayMed}" />`;
  svg += `<rect x="${xOfT(55)}" y="${top}" width="${xOfT(60)-xOfT(55)}" height="${plotH}" fill="${grayLight}" />`;

  // Grade vertical (ticks brancos)
  for(let t=20; t<=80; t+=5){
    const x = xOfT(t);
    svg += `<line x1="${x}" y1="${top}" x2="${x}" y2="${top+plotH}" stroke="#fff" stroke-width="2" />`;
    // Textos do cabeçalho do gráfico
    let label = t;
    if(t===20) label = "min 20";
    if(t===40) label = "-S 40";
    if(t===50) label = "m 50";
    if(t===60) label = "+S 60";
    if(t===80) label = "max 80";
    svg += `<text x="${x}" y="${top-10}" text-anchor="middle" font-size="12" font-family="Arial" fill="#111">${label}</text>`;
  }

  // Textos laterais esquerdos
  svg += `<text x="${15}" y="${top-10}" font-size="12" font-family="Arial" font-weight="bold" fill="#111" transform="rotate(-90, 15, ${top-10})">Dados brutos</text>`;
  svg += `<text x="${35}" y="${top-10}" font-size="12" font-family="Arial" font-weight="bold" fill="#111" transform="rotate(-90, 35, ${top-10})">Normas</text>`;

  // Grade horizontal branca
  rows.forEach((r,i) => {
    svg += `<line x1="${xOfT(20)}" y1="${yOfI(i)}" x2="${xOfT(80)}" y2="${yOfI(i)}" stroke="#fff" stroke-width="1.5" />`;
  });

  // Linha conectando os pontos
  let path = "";
  rows.forEach((r,i) => {
    const x = xOfT(r.t ?? 50);
    const y = yOfI(i);
    path += (i===0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
  });
  svg += `<path d="${path}" fill="none" stroke="#000" stroke-width="2"/>`;

  // Pontos vermelhos e Labels
  rows.forEach((r,i) => {
    const y = yOfI(i);
    const x = xOfT(r.t ?? 50);
    // Valores numéricos
    svg += `<text x="${10}" y="${y+4}" font-size="12" font-family="Arial" fill="#111">${r.bruto ?? "—"}</text>`;
    svg += `<text x="${30}" y="${y+4}" font-size="12" font-family="Arial" fill="#111">${r.t ?? "—"}</text>`;
    
    // Ponto vermelho (exato do modelo)
    svg += `<circle cx="${x}" cy="${y}" r="6" fill="#e3001b"/>`;

    // Nome da Escala à direita
    svg += `<text x="${xOfT(80) + 15}" y="${y+4}" font-size="12" font-family="Arial" font-weight="bold" fill="#111">${escapeHtml(r.label)}</text>`;
  });

  svg += `</svg>`;
  return svg;
}

// --- SVG: Curva Sino (Detalhes da escala) ---
function svgBell(t){
  const W=500, H=160;
  const tMin=20, tMax=80;
  const xPad=20, yPad=20;
  const plotW = W - xPad*2;
  const baseY = H - 30;

  function xOfT(val){
    const tt = clamp(Number(val), tMin, tMax);
    return xPad + ((tt - tMin)/(tMax - tMin))*plotW;
  }

  // Sino em polígono estilo Hogrefe
  const pts = [];
  for(let i=0; i<=80; i++){
    const u = i/80;
    const x = xPad + u*plotW;
    const y = baseY - Math.exp(-Math.pow((u-0.5)/0.22, 2)) * 110;
    pts.push([x,y]);
  }
  const d = pts.map((p,i)=> (i===0?`M ${p[0]} ${p[1]}`:`L ${p[0]} ${p[1]}`)).join(" ") + ` L ${xPad+plotW} ${baseY} L ${xPad} ${baseY} Z`;

  const xt = xOfT(t ?? 50);

  return `
  <svg class="rep-bell" viewBox="0 0 ${W} ${H}" width="100%" height="auto" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>
    <path d="${d}" fill="#e8fbfa" />
    
    <rect x="${xOfT(40)}" y="${baseY-110}" width="${xOfT(60)-xOfT(40)}" height="110" fill="#d0f0ee" opacity="0.4"/>

    <line x1="${xt}" y1="${baseY-110}" x2="${xt}" y2="${baseY}" stroke="#e3001b" stroke-width="2.5"/>
    <circle cx="${xt}" cy="${baseY-110}" r="5" fill="#e3001b"/>

    <line x1="${xPad}" y1="${baseY}" x2="${xPad+plotW}" y2="${baseY}" stroke="#111" stroke-width="1.5"/>

    ${[20,30,40,50,60,70,80].map(v => `
      <text x="${xOfT(v)}" y="${baseY+20}" text-anchor="middle" font-size="14" font-family="Arial" fill="#111">${v}</text>
    `).join("")}
  </svg>`;
}

function buildInterpretationText(){
  return `
    <p>A SRS-2 oferece em seu relatório uma descrição detalhada da interpretação dos resultados a partir do escore T (métrica padronizada que permite avaliar quantos desvios o avaliando se distanciou da média, que é fixada em 50 e o seu desvio-padrão, em 10 pontos).</p>

    <p><b>Escore-T 59 e abaixo - Dentro dos limites normais</b><br>
    As pontuações neste intervalo geralmente não estão associadas ao TEA. Crianças com autismo muito leve podem mostrar pontuações na extremidade superior do nível normal se estiverem bem ajustadas e a sua funcionalidade adaptativa estiver relativamente intacta.</p>

    <p><b>Escore-T entre 60 e 65 - Nível leve</b><br>
    As pontuações neste intervalo indicam prejuízos no comportamento social recíproco que são clinicamente significativos e podem levar a uma interferência de leve a moderada nas interações sociais cotidianas. Essas pontuações são comumente vistas em crianças com condições no espectro do autismo e, ocasionalmente, em crianças que apresentam prejuízos na reciprocidade social relacionados a formas mais severas de Transtorno de Déficit de Atenção e Hiperatividade (TDAH). Para os pré-escolares, em especial, é importante considerar se o Transtorno Específico de Linguagem (TEL) ou deficiência intelectual contribuem para suspeitas de prejuízo na comunicação social.</p>

    <p><b>Escore-T entre 66 e 75 - Nível moderado</b><br>
    As pontuações nesta faixa da escala indicam prejuízos no comportamento social recíproco clinicamente significativos que levam a uma interferência substancial nas interações sociais cotidianas. Tais pontuações são típicas em crianças com Transtorno do Espectro Autista de gravidade moderada, incluindo os diagnósticos do DSM-IV para Transtorno do Autismo, Transtorno Global do Desenvolvimento sem outra especificação (TGD SOE) e Transtorno de Asperger, e o diagnóstico DSM-5 estabelecido pelo Transtorno de Comunicação Social e pelo Transtorno do Espectro Autista.</p>

    <p><b>Escore-T 76 e acima - Nível severo</b><br>
    As pontuações nesta faixa da escala indicam prejuízos no comportamento social recíproco que são clinicamente significativos e levam a uma interferência severa nas interações sociais diárias. Essas pontuações estão fortemente associadas aos diagnósticos clínicos de Transtorno do Autismo, Síndrome de Asperger ou casos mais severos de Transtorno Global do desenvolvimento sem outra especificação (TGD-SOE). Mesmo neste nível, é comum que as pontuações da SRS-2 se atenuem em algum grau durante o período entre a idade pré-escolar e a idade escolar.</p>
  `.trim();
}

function preencherRelatorioSRS2(result){
  const form = getForm();
  if(!form) return;

  const scalesSorted = sortScalesLikePdf(form.scales);

  // header
  document.getElementById("repSubTitle").textContent = (form.label || FORM_KEY);
  document.getElementById("repTableSub").textContent = (form.label || FORM_KEY);
  // Puxa o nome do teste e deixa em maiúsculas
  const formLabelUpper = (form.label || FORM_KEY).toUpperCase();
  document.getElementById("repProfileTitle").textContent = `${formLabelUpper} • ESCORE T (50+10z)`;
  document.getElementById("repPaciente").textContent = document.getElementById("paciente").value || "—";
  document.getElementById("repData").textContent = document.getElementById("data").value || "—";
  document.getElementById("repAvaliador").textContent = document.getElementById("avaliador").value || "—";

  // missing por escala
  const missingByScale = countMissingByScale(form);

  // montar rows
  const rows = scalesSorted.map(sc => ({
    key: sc.key,
    label: sc.label || sc.key,
    bruto: result.brutos?.[sc.key],
    t: result.tscores?.[sc.key]
  }));

  // 1) Perfil
  document.getElementById("repProfileChart").innerHTML = svgProfileChart(rows);

  // 2) Tabela de escores
  const tbody = document.querySelector("#repScoreTable tbody");
  tbody.innerHTML = "";
  for(const r of rows){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.label)}</td>
      <td class="right" style="text-align: right;">${r.t ?? "—"}</td>
    `;
    tbody.appendChild(tr);
  }

  // 3) Seções por escala
  const container = document.getElementById("repScaleSections");
  container.innerHTML = "";

for(const r of rows){
    const t = (r.t == null ? null : Number(r.t));
    const ciA = (t == null ? "—" : clamp(t - 4, 20, 80));
    const ciB = (t == null ? "—" : clamp(t + 4, 20, 80));
    const missing = missingByScale[r.key] ?? 0;

    const descKey = SCALE_ORDER_HINTS.find(h => normalizeStr(r.label).includes(normalizeStr(h))) || r.label;
    const desc = SCALE_DESCRIPTIONS[descKey] || "";

    const sec = document.createElement("section");
    sec.className = "rep-scale";

    sec.innerHTML = `
      <div style="font-size: 14pt; font-weight: bold; margin-bottom: 5px; color:#111;">${escapeHtml(r.label)}</div>
      <div style="font-size: 10pt; color: #555; margin-bottom: 15px; text-transform: uppercase;">${formLabelUpper} • ESCORE T (50+10z)</div>

      <div class="rep-scale-grid" style="display:flex; justify-content: space-between; align-items: flex-end;">
        <div style="width: 45%;">
          <table class="rep-mini-table" style="width:100%; border-collapse: collapse;">
            <tbody>
              <tr style="background:#f4f9f9;"><td style="padding:8px;">Pontuação bruta</td><td style="text-align:right; padding:8px;">${r.bruto ?? "—"}</td></tr>
              <tr><td style="padding:8px;">Valor da norma</td><td style="text-align:right; padding:8px;">${r.t ?? "—"}</td></tr>
              <tr style="background:#f4f9f9;"><td style="padding:8px;">Respostas faltantes (missing)</td><td style="text-align:right; padding:8px;">${missing}</td></tr>
              <tr><td style="padding:8px;">Intervalo de confiança</td><td style="text-align:right; padding:8px;">[${ciA} - ${ciB}]</td></tr>
            </tbody>
          </table>
        </div>
        <div style="width: 50%;">
          ${svgBell(t)}
        </div>
      </div>
      <div class="rep-scale-desc" style="font-size: 11pt; line-height: 1.5; color: #333; text-align: justify;">${escapeHtml(desc)}</div>
    `;

    container.appendChild(sec);
  }

  // 4) Interpretação
  document.getElementById("repInterpretation").innerHTML = buildInterpretationText();
}

// Vincula o botão "Finalizar e Enviar" à função de geração de PDF e envio para o Drive
function instalarBotaoEnviar() {
  const btnEnviar = document.getElementById("btnEnviar");
  if (btnEnviar) {
    btnEnviar.addEventListener("click", () => {
      finalizarEEnviar();
    });
  }
}

function finalizarEEnviar() {
  // 1. Garante que os cálculos foram feitos e o relatório foi montado
  const result = calcularEExibir();
  if(result){
    preencherRelatorioSRS2(result);
  }
  
  // 2. Muda visualmente o botão
  const btn = document.getElementById("btnEnviar");
  if (btn) {
    btn.textContent = "A processar envio... aguarde";
    btn.style.opacity = "0.7";
    btn.disabled = true;
  }

  // O SEGREDO 1: Sobe a página para o topo. Se a tela estiver rolada para baixo, a foto sai em branco!
  window.scrollTo(0, 0);

  // 3. Cria uma "Cortina de Carregamento" para tapar a visão do paciente
  const cortina = document.createElement("div");
  cortina.style.cssText = "position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: #f6f3ff; z-index: 9999; display: flex; align-items: center; justify-content: center; font-size: 22px; color: #4c1d95; font-weight: bold; flex-direction: column; gap: 15px;";
  cortina.innerHTML = "<span>⏳ A preparar o documento seguro...</span><span style='font-size: 16px; color: #6d28d9;'>Por favor, não feche esta página.</span>";
  document.body.appendChild(cortina);

  const nomePaciente = document.getElementById("paciente").value || "Paciente_Sem_Nome";
  const elemento = document.getElementById("report");

  // 4. Mostra o relatório atrás da cortina e força a largura do PC
  elemento.style.setProperty("display", "block", "important");
  elemento.style.background = "#fff";
  elemento.style.width = "800px"; 
  elemento.style.maxWidth = "800px";
  elemento.style.position = "absolute"; 
  elemento.style.left = "0"; 
  elemento.style.top = "0";
  // O SEGREDO 2: O relatório fica na "camada 9990", invisível para o utilizador (tampado pela cortina 9999), mas perfeito para a fotografia!
  elemento.style.zIndex = "9990"; 

  // O SEGREDO 3: Atrasar a fotografia em 0.5 segundos (500 milissegundos) para o navegador ter tempo de desenhar os gráficos SVG.
  setTimeout(() => {
    
    const opt = {
      margin:       15,
      filename:     'resultado.pdf',
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, scrollY: 0 }, 
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(elemento).outputPdf('datauristring').then(function(pdfBase64) {
      
      // Limpa as formatações forçadas e esconde o relatório novamente
      elemento.style.setProperty("display", "none", "important");
      elemento.style.width = "";
      elemento.style.maxWidth = "";
      elemento.style.position = "";
      elemento.style.left = "";
      elemento.style.top = "";
      elemento.style.zIndex = "";

      const base64Limpo = pdfBase64.split(',')[1];

      // Envia para o Google Drive
      fetch(URL_DO_GOOGLE_SCRIPT, {
        method: "POST",
        body: JSON.stringify({
          pdf: base64Limpo,
          nome: nomePaciente
        })
      })
      .then(response => response.json())
      .then(data => {
        // Tira a cortina de carregamento
        document.body.removeChild(cortina); 

        if (data.status === "sucesso") {
          document.querySelector("main").innerHTML = `
            <div style="text-align: center; padding: 60px 20px; background: #fff; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); max-width: 600px; margin: 0 auto;">
              <div style="font-size: 50px; margin-bottom: 20px;">✅</div>
              <h1 style="color: #4c1d95; font-size: 26px; margin-bottom: 10px;">Avaliação Finalizada!</h1>
              <p style="font-size: 16px; color: #555; line-height: 1.5;">As suas respostas foram processadas e enviadas com segurança para o profissional responsável.</p>
              <p style="font-size: 14px; color: #888; margin-top: 30px;">Já pode fechar esta janela.</p>
            </div>
          `;
          window.scrollTo(0, 0); 
        } else {
          alert("Ocorreu um erro ao enviar: " + data.mensagem);
          if (btn) { btn.textContent = "Tentar Novamente"; btn.style.opacity = "1"; btn.disabled = false; }
        }
      })
      .catch(erro => {
        document.body.removeChild(cortina);
        alert("Erro de ligação. Por favor, verifique a sua internet e tente novamente.");
        if (btn) { btn.textContent = "Tentar Novamente"; btn.style.opacity = "1"; btn.disabled = false; }
      });
    });

  }, 500); // Fim do atraso de meio segundo
}
