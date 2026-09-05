import { mainViewFromHash } from "./mainContext.js";

export { mainViewFromHash } from "./mainContext.js";

export const VIEW_RENDERED_EVENT = "loto-lab:view-rendered";

export type ViewRenderedDetail = {
  view?: string;
  lottery?: string;
  token?: number;
};

export function currentMainView(): string {
  return mainViewFromHash(window.location.hash);
}

export function onMainViewChanged(callback: (view: string) => void): () => void {
  const listener = () => callback(currentMainView());
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

export function onViewRendered(callback: (detail: ViewRenderedDetail) => void): () => void {
  const listener = (event: Event) => {
    const detail = event instanceof CustomEvent ? event.detail : undefined;
    callback(detail && typeof detail === "object" ? detail as ViewRenderedDetail : {});
  };
  window.addEventListener(VIEW_RENDERED_EVENT, listener);
  return () => window.removeEventListener(VIEW_RENDERED_EVENT, listener);
}

export function emitViewRendered(detail: ViewRenderedDetail): void {
  window.dispatchEvent(new CustomEvent<ViewRenderedDetail>(VIEW_RENDERED_EVENT, { detail }));
}
