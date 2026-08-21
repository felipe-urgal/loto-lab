const EXACT_TEXT = new Map([
  ["Dashboard", "Painel"],
  ["Backtests", "Testes históricos"],
  ["Backtest", "Teste histórico"],
  ["Strategy console", "Console de estratégias"],
  ["Ranking", "Classificação"],
  ["Score", "Pontuação"],
  ["Lookback", "Janela histórica"],
  ["Bucket", "Bloco"],
  ["Slug", "Identificador"],
  ["Experimento Lab", "Experimento do Laboratório"],
  ["Lookback Lab", "Janela histórica do Laboratório"],
  ["Bucket Lab", "Bloco do Laboratório"],
  ["queued", "na fila"],
  ["running", "em execução"],
  ["succeeded", "concluída"],
  ["completed", "concluída"],
  ["failed", "falhou"],
  ["cancelled", "cancelada"],
  ["abandoned", "abandonada"],
]);

const EXACT_PHRASES = new Map([
  ["Loto Lab - Dashboard", "Loto Lab - Painel"],
  ["Frequências, score e classificação por horizonte.", "Frequências, pontuação e classificação por horizonte."],
  ["Resumo do último backtest persistido.", "Resumo do último teste histórico salvo."],
  ["Ver backtests", "Ver testes históricos"],
  ["Sem backtest", "Sem teste histórico"],
  ["Teste a estratégia em dados passados sem vazamento futuro.", "Teste a estratégia em dados passados sem vazamento futuro."],
  ["Jobs são serializados para preservar CPU e memória.", "As execuções são serializadas para preservar CPU e memória."],
  ["Uma estratégia selecionada fornece os defaults; valores preenchidos neste formulário têm prioridade.", "Uma estratégia selecionada fornece os valores padrão; valores preenchidos neste formulário têm prioridade."],
  ["Processando em worker dedicado", "Processando em processo dedicado"],
  ["Aguardando o gate de análises.", "Aguardando disponibilidade para análises."],
  ["Esses parâmetros alimentam a fila de Backtests/Laboratório. O histórico guarda o ID exato da versão usada.", "Esses parâmetros alimentam a fila de testes históricos e do Laboratório. O histórico guarda o ID exato da versão usada."],
  ["A IA recebe um resumo auditável de análise, backtest, Laboratório e apostas reais. Ela não escolhe dezenas nem recalcula métricas.", "A IA recebe um resumo auditável de análise, teste histórico, Laboratório e apostas reais. Ela não escolhe dezenas nem recalcula métricas."],
  ["Snapshots anteriores da loteria selecionada.", "Registros anteriores da loteria selecionada."],
  ["Backtests e laboratório\nfora da requisição HTTP.", "Testes históricos e laboratório\nfora da requisição HTTP."],
]);

function replaceKnownPhrases(value) {
  const trimmed = value.trim();
  if (EXACT_TEXT.has(trimmed)) return value.replace(trimmed, EXACT_TEXT.get(trimmed));
  if (EXACT_PHRASES.has(trimmed)) return value.replace(trimmed, EXACT_PHRASES.get(trimmed));

  let output = value;
  output = output.replace(/\bBacktests\b/g, "Testes históricos");
  output = output.replace(/\bbacktests\b/g, "testes históricos");
  output = output.replace(/\bBacktest #/g, "Teste histórico #");
  output = output.replace(/\bBacktest concluído\b/g, "Teste histórico concluído");
  output = output.replace(/\bSem backtest\b/g, "Sem teste histórico");
  output = output.replace(/\bwarmup\s+(\d+)/gi, "aquecimento $1");
  output = output.replace(/\branking por\s+prizeRate\b/g, "classificação por taxa de premiação");
  output = output.replace(/\branking por\s+averageHitsPerGame\b/g, "classificação por média de acertos");
  output = output.replace(/\branking por\s+roi\b/gi, "classificação por ROI");
  output = output.replace(/\branking por\b/gi, "classificação por");
  return output;
}

function replaceAnalysisTerms(value) {
  return replaceKnownPhrases(value)
    .replace(/\bRanking\b/g, "Classificação")
    .replace(/\branking\b/g, "classificação")
    .replace(/\bScore\b/g, "Pontuação")
    .replace(/\bscore\b/g, "pontuação")
    .replace(/\bHeatmap\b/g, "Mapa de calor")
    .replace(/\bheatmap\b/g, "mapa de calor")
    .replace(/\bBaseline\b/g, "Referência")
    .replace(/\bbaseline\b/g, "referência")
    .replace(/\bSnapshot\b/g, "Registro")
    .replace(/\bsnapshot\b/g, "registro")
    .replace(/\bWalk-forward\b/gi, "validação progressiva")
    .replace(/\bLift\b/g, "Razão obs./esp.")
    .replace(/\bp-value\b/gi, "valor-p")
    .replace(/\bTop dezenas por pontuação\b/gi, "Dezenas com maior pontuação")
    .replace(/\bTop\s+(\d+)\b/g, "$1 melhores");
}

function shouldUseAnalysisVocabulary(node) {
  const element = node.parentElement;
  if (!element) return false;
  if (element.closest(".a2-shell")) return true;
  if (location.pathname === "/" || location.pathname === "/index.html") return Boolean(element.closest("#content, .topbar, .sidebar"));
  if (document.body.dataset.activeNav === "lab") return true;
  return false;
}

function translateTextNode(node) {
  if (!node.nodeValue || !node.nodeValue.trim()) return;
  const parent = node.parentElement;
  if (!parent || parent.closest("script, style, code, pre")) return;

  let next = shouldUseAnalysisVocabulary(node)
    ? replaceAnalysisTerms(node.nodeValue)
    : replaceKnownPhrases(node.nodeValue);

  if (parent.classList.contains("status-pill")) {
    const trimmed = next.trim();
    if (EXACT_TEXT.has(trimmed)) next = next.replace(trimmed, EXACT_TEXT.get(trimmed));
  }

  if (next !== node.nodeValue) node.nodeValue = next;
}

function translateAttributes(element) {
  for (const attribute of ["aria-label", "title", "placeholder"]) {
    const value = element.getAttribute?.(attribute);
    if (!value) continue;
    const next = shouldUseAnalysisVocabulary(element.firstChild || { parentElement: element })
      ? replaceAnalysisTerms(value)
      : replaceKnownPhrases(value);
    if (next !== value) element.setAttribute(attribute, next);
  }
}

function translateTree(root) {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root);
    return;
  }
  if (!(root instanceof Element) && root !== document) return;
  if (root instanceof Element) translateAttributes(root);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) translateTextNode(node);

  if (root.querySelectorAll) {
    root.querySelectorAll("[aria-label], [title], [placeholder]").forEach(translateAttributes);
  }
}

translateTree(document);

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.type === "characterData") translateTextNode(mutation.target);
    for (const node of mutation.addedNodes) translateTree(node);
  }
});
observer.observe(document.body, { subtree: true, childList: true, characterData: true });
