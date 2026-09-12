import {
  isLotteryId,
  mainViewFromHash,
  type LotteryId,
  type MainView,
} from "./mainContext.js";

export const DEFAULT_LOTTERY: LotteryId = "mega-sena";

export interface MainRenderSnapshot {
  token: number;
  view: MainView;
  lottery: LotteryId;
  signal: AbortSignal;
}

export interface MainRenderState {
  view: MainView;
  lottery: LotteryId;
  loading: boolean;
  beginRender(): MainRenderSnapshot;
  isCurrentRender(render: MainRenderSnapshot): boolean;
  finishRender(render: MainRenderSnapshot): boolean;
}

export function lotteryFromStoredValue(value: string | null): LotteryId {
  return isLotteryId(value) ? value : DEFAULT_LOTTERY;
}

export function createMainRenderState(
  initialHash: string,
  storedLottery: string | null,
): MainRenderState {
  let view = mainViewFromHash(initialHash);
  let lottery = lotteryFromStoredValue(storedLottery);
  let loading = false;
  let renderToken = 0;
  let renderController: AbortController | null = null;

  return {
    get view() {
      return view;
    },
    set view(next: MainView) {
      view = next;
    },
    get lottery() {
      return lottery;
    },
    set lottery(next: LotteryId) {
      lottery = next;
    },
    get loading() {
      return loading;
    },
    set loading(next: boolean) {
      loading = next;
    },
    beginRender() {
      renderController?.abort();
      const controller = new AbortController();
      renderController = controller;
      loading = true;

      return {
        token: ++renderToken,
        view,
        lottery,
        signal: controller.signal,
      };
    },
    isCurrentRender(render) {
      return !render.signal.aborted
        && render.token === renderToken
        && render.view === view
        && render.lottery === lottery;
    },
    finishRender(render) {
      if (render.token !== renderToken) return false;
      loading = false;
      return true;
    },
  };
}
