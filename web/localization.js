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
  ["historical", "Histórico"],
  ["year", "Ano"],
  ["month", "Mês"],
  ["recent10", "Últimos 10"],
  ["recent20", "Últimos 20"],
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
  ["Baseline condicionado", "Referência condicionada"],
  ["Frequências, score e classificação por horizonte.", "Frequências, pontuação e classificação por horizonte."],
  ["maior score combinado", "maior pontuação combinada"],
  ["menor score combinado", "menor pontuação combinada"],
  ["Decomposição do score", "Decomposição da pontuação"],
  ["Quanto cada janela contribui para o score final com os pesos atuais.", "Quanto cada janela contribui para a pontuação final com os pesos atuais."],
  ["Resumo do último backtest persistido.", "Resumo do último teste histórico salvo."],
  ["Ver backtests", "Ver testes históricos"],
  ["Sem backtest", "Sem teste histórico"],
  ["Jobs são serializados para preservar CPU e memória.", "As execuções são serializadas para preservar CPU e memória."],
  ["Uma estratégia selecionada fornece os defaults; valores preenchidos neste formulário têm prioridade.", "Uma estratégia selecionada fornece os valores padrão; valores preenchidos neste formulário têm prioridade."],
  ["Processando em worker dedicado", "Processando em processo dedicado"],
  ["Aguardando o gate de análises.", "Aguardando disponibilidade para análises."],
  ["Esses parâmetros alimentam a fila de Backtests/Laboratório. O histórico guarda o ID exato da versão usada.", "Esses parâmetros alimentam a fila de testes históricos e do Laboratório. O histórico guarda o ID exato da versão usada."],
  ["A IA recebe um resumo auditável de análise, backtest, Laboratório e apostas reais. Ela não escolhe dezenas nem recalcula métricas.", "A IA recebe um resumo auditável de análise, teste histórico, Laboratório e apostas reais. Ela não escolhe dezenas nem recalcula métricas."],
  ["Snapshots anteriores da loteria selecionada.", "Registros anteriores da loteria selecionada."],
  ["Sem marcar, evidência idêntica reutiliza o snapshot anterior e evita custo desnecessário.", "Sem marcar, evidência idêntica reutiliza o registro anterior e evita custo desnecessário."],
  ["Backtests e laboratório\nfora da requisição HTTP.", "Testes históricos e laboratório\nfora da requisição HTTP."],
]);

function replaceKnownPhrases(value) {
  const trimmed = value.trim();
  if (EXACT_TEXT.has(trimmed)) return value.replace(trimmed, EXACT_TEXT.get(trimmed));
  if (EXACT_PHRASES.has(trimmed)) return value.replace(trimmed, EXACT_PHRASES.get(trimmed));
  return value;
}

function replaceOperationalTerms(value) {
  return replaceKnownPhrases(value)
    .replace(/\bBacktests\b/g, "Testes históricos")
    .replace(/\bbacktests\b/g, "testes históricos")
    .replace(/\bBacktest #/g, "Teste histórico #")
    .replace(/\bBacktest concluído\b/g, "Teste histórico concluído")
    .replace(/\bSem backtest\b/g, "Sem teste histórico")
    .replace(/\bSnapshot\b/g, "Registro")
    .replace(/\bsnapshot\b/g, "registro")
    .replace(/\bwarmup\s+(\d+)/gi, "aquecimento $1")
    .replace(/\branking por\s+prizeRate\b/g, "classificação por taxa de premiação")
    .replace(/\branking por\s+averageHitsPerGame\b/g, "classificação por média de acertos")
    .replace(/\branking por\s+roi\b/gi, "classificação por ROI")
    .replace(/\branking por\b/gi, "classificação por");
}

function replaceAnalysisTerms(value) {
  return replaceOperationalTerms(value)
    .replace(/\bz-score\b/gi, "escore-z")
    .replace(/\brank\s+#/gi, "posição #")
    .replace(/\bBacktest\b/g, "Teste histórico")
    .replace(/\bbacktest\b/g, "teste histórico")
    .replace(/\bRanking\b/g, "Classificação")
    .replace(/\branking\b/g, "classificação")
    .replace(/\bScore\b/g, "Pontuação")
    .replace(/\bscore\b/g, "pontuação")
    .replace(/\bHeatmap\b/g, "Mapa de calor")
    .replace(/\bheatmap\b/g, "mapa de calor")
    .replace(/\bBaseline\b/g, "Referência")
    .replace(/\bbaseline\b/g, "referência")
    .replace(/\bWalk-forward\b/gi, "validação progressiva")
    .replace(/\bLift\b/g, "Razão obs./esp.")
    .replace(/\bp-value\b/gi, "valor-p")
    .replace(/\bTop dezenas por pontuação\b/gi, "Dezenas com maior pontuação")
    .replace(/\bTop\s+(\d+)\b/g, "$1 melhores");
}

function parentElementFor(node) {
  if (node instanceof Element) return node;
  return node?.parentElement || null;
}

function shouldUseAnalysisVocabulary(node) {
  const element = parentElementFor(node);
  if (!element) return false;
  if (element.closest(".a2-shell")) return true;
  if (location.pathname === "/" || location.pathname === "/index.html") {
    return Boolean(element.closest("#content, .topbar, .sidebar"));
  }
  if (document.body.dataset.activeNav === "lab") return true;
  return false;
}

function shouldUseOperationalVocabulary(node) {
  const element = parentElementFor(node);
  if (!element) return false;
  return Boolean(element.closest([
    ".job-result",
    ".experiment-meta",
    ".status-pill",
    ".form-inline-note",
    ".form-note",
    ".ai-principle",
    ".ai-history",
    ".sidebar",
    ".topbar",
    ".section-head",
  ].join(",")));
}

function localizedValue(value, node) {
  if (shouldUseAnalysisVocabulary(node)) return replaceAnalysisTerms(value);
  if (shouldUseOperationalVocabulary(node)) return replaceOperationalTerms(value);
  return replaceKnownPhrases(value);
}

function translateTextNode(node) {
  if (!node.nodeValue || !node.nodeValue.trim()) return;
  const parent = node.parentElement;
  if (!parent || parent.closest("script, style, code, pre")) return;

  const next = localizedValue(node.nodeValue, node);
  if (next !== node.nodeValue) node.nodeValue = next;
}

function translateAttributes(element) {
  for (const attribute of ["aria-label", "title", "placeholder"]) {
    const value = element.getAttribute?.(attribute);
    if (!value) continue;
    const next = localizedValue(value, element);
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
