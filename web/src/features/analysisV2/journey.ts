import {
  currentMainView,
  onMainViewChanged,
  onViewRendered,
} from "../../core/viewLifecycle.js";

const root = document.querySelector<HTMLElement>("#content");
const ACTIONS_ID = "a2-journey-actions";
let observer: MutationObserver | null = null;

function actionLink(href: string, label: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "button compact";
  link.href = href;
  link.textContent = label;
  return link;
}

function mountJourneyActions(): void {
  if (!root || currentMainView() !== "analysis" || root.querySelector(`#${ACTIONS_ID}`)) return;
  const principle = root.querySelector<HTMLElement>(".a2-principle");
  if (!principle) return;

  const navigation = document.createElement("nav");
  navigation.id = ACTIONS_ID;
  navigation.className = "panel a2-compare-panel";
  navigation.setAttribute("aria-label", "Próximos passos da análise");

  const head = document.createElement("div");
  head.className = "a2-panel-head";
  const copy = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = "Próximos passos";
  const description = document.createElement("span");
  description.textContent = "Experimente uma hipótese no Laboratório ou aplique uma configuração já compreendida no Gerador.";
  copy.append(title, description);
  head.append(copy);

  const actions = document.createElement("div");
  actions.className = "a2-compare-controls";
  actions.append(
    actionLink("/lab", "Experimentar no Laboratório"),
    actionLink("/#generate", "Gerar jogos"),
  );

  navigation.append(head, actions);
  principle.insertAdjacentElement("afterend", navigation);
}

function startObserver(): void {
  if (!root || currentMainView() !== "analysis") return;
  mountJourneyActions();
  if (observer) return;
  observer = new MutationObserver(() => mountJourneyActions());
  observer.observe(root, { childList: true, subtree: true });
}

function stopObserver(): void {
  observer?.disconnect();
  observer = null;
}

onViewRendered(({ view }) => {
  if (view === "analysis") startObserver();
  else stopObserver();
});

onMainViewChanged((view) => {
  if (view === "analysis") startObserver();
  else stopObserver();
});

if (currentMainView() === "analysis") startObserver();
