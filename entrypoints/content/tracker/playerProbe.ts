const DEFAULT_TIMEOUT_MS = 15_000;

export interface PlayerProbeState {
  paused: boolean;
  ended: boolean;
  readyState: number;
  currentTime: number;
}

export interface PlayerProbeHandle {
  video: HTMLVideoElement;
  getState(): PlayerProbeState;
  dispose(): void;
}

const findVideoElement = (): HTMLVideoElement | null => {
  return document.querySelector("video");
};

export const waitForPlayerProbe = async (timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<PlayerProbeHandle | null> => {
  const immediate = findVideoElement();
  if (immediate) {
    return {
      video: immediate,
      getState: () => ({
        paused: immediate.paused,
        ended: immediate.ended,
        readyState: immediate.readyState,
        currentTime: immediate.currentTime
      }),
      dispose: () => undefined
    };
  }

  return new Promise((resolve) => {
    let done = false;
    const cleanup = (result: PlayerProbeHandle | null): void => {
      if (done) {
        return;
      }

      done = true;
      observer.disconnect();
      clearTimeout(timeoutId);
      resolve(result);
    };

    const observer = new MutationObserver(() => {
      const video = findVideoElement();
      if (!video) {
        return;
      }

      cleanup({
        video,
        getState: () => ({
          paused: video.paused,
          ended: video.ended,
          readyState: video.readyState,
          currentTime: video.currentTime
        }),
        dispose: () => undefined
      });
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    const timeoutId = window.setTimeout(() => cleanup(null), timeoutMs);
  });
};

