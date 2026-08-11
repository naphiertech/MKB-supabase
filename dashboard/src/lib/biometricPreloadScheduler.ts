interface BiometricPreloadScheduleOptions {
  initialDelayMs?: number;
  quietPeriodMs?: number;
}

export function createBiometricPreloadPriority() {
  let foregroundRequested = false;

  return {
    requestForeground() {
      foregroundRequested = true;
    },
    canContinueBackground() {
      return !foregroundRequested;
    },
  };
}

export const biometricPreloadPriority = createBiometricPreloadPriority();

export function waitForBrowserIdle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => resolve());
      return;
    }

    window.setTimeout(resolve, 0);
  });
}

export function scheduleBiometricPreload(
  task: () => Promise<void> | void,
  {
    initialDelayMs = 1500,
    quietPeriodMs = 1000,
  }: BiometricPreloadScheduleOptions = {},
): () => void {
  let delayTimer: number | null = null;
  let idleCallbackId: number | null = null;
  let cancelled = false;
  let started = false;
  const earliestStartAt = Date.now() + initialDelayMs;

  const interactionEvents: (keyof WindowEventMap)[] = [
    'pointerdown',
    'touchstart',
    'keydown',
    'scroll',
  ];

  const removeInteractionListeners = () => {
    interactionEvents.forEach((eventName) => {
      window.removeEventListener(eventName, handleInteraction, true);
    });
  };

  const runTask = () => {
    if (cancelled || started) return;
    started = true;
    idleCallbackId = null;
    removeInteractionListeners();
    void task();
  };

  const requestIdleStart = () => {
    delayTimer = null;
    if (cancelled || started) return;

    if (typeof window.requestIdleCallback === 'function') {
      idleCallbackId = window.requestIdleCallback(runTask);
      return;
    }

    delayTimer = window.setTimeout(runTask, 0);
  };

  const scheduleAfter = (delayMs: number) => {
    if (delayTimer !== null) window.clearTimeout(delayTimer);
    delayTimer = window.setTimeout(requestIdleStart, Math.max(0, delayMs));
  };

  function handleInteraction() {
    if (cancelled || started) return;

    if (idleCallbackId !== null && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(idleCallbackId);
      idleCallbackId = null;
    }

    const quietUntil = Date.now() + quietPeriodMs;
    scheduleAfter(Math.max(earliestStartAt, quietUntil) - Date.now());
  }

  interactionEvents.forEach((eventName) => {
    window.addEventListener(eventName, handleInteraction, {
      capture: true,
      passive: eventName !== 'keydown',
    });
  });
  scheduleAfter(initialDelayMs);

  return () => {
    cancelled = true;
    if (delayTimer !== null) window.clearTimeout(delayTimer);
    if (idleCallbackId !== null && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(idleCallbackId);
    }
    removeInteractionListeners();
  };
}
