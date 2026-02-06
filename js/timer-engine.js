/**
 * @typedef {"focus"|"shortBreak"|"longBreak"} Mode
 * @typedef {"idle"|"running"|"paused"} TimerState
 *
 * @typedef {{
 *   mode: Mode,
 *   timerState: TimerState,
 *   endAtMs: number|null,
 *   remainingSec: number,
 *   cycleCountSinceLongBreak: number,
 *   activeTaskId: string|null
 * }} Runtime
 */

function clampInt(value, min, max) {
	const n = Number.parseInt(String(value), 10);
	if (Number.isNaN(n)) return min;
	return Math.max(min, Math.min(max, n));
}

export function createTimerEngine({ onTick, onFinish }) {
	/** @type {Runtime|null} */
	let runtime = null;
	/** @type {(mode: Mode) => number} */
	let getModeDurationSec = null;

	let intervalId = null;
	let lastShownSec = null;

	function stopLoop() {
		if (intervalId !== null) {
			clearInterval(intervalId);
			intervalId = null;
		}
	}

	function computeRemainingSec(nowMs) {
		if (!runtime) return 0;
		if (runtime.timerState !== "running") return clampInt(runtime.remainingSec, 0, 999999);
		if (typeof runtime.endAtMs !== "number") return clampInt(runtime.remainingSec, 0, 999999);

		const diffMs = runtime.endAtMs - nowMs;
		return clampInt(Math.ceil(diffMs / 1000), 0, 999999);
	}

	function tick() {
		if (!runtime) return;
		if (runtime.timerState !== "running") {
			stopLoop();
			return;
		}

		const nowMs = Date.now();
		const remaining = computeRemainingSec(nowMs);
		runtime.remainingSec = remaining;

		if (remaining !== lastShownSec) {
			lastShownSec = remaining;
			onTick?.(remaining);
		}

		if (remaining <= 0) {
			stopLoop();
			runtime.timerState = "idle";
			runtime.endAtMs = null;
			runtime.remainingSec = 0;
			onFinish?.({ reason: "complete" });
		}
	}

	function ensureLoop() {
		if (intervalId !== null) return;
		intervalId = setInterval(tick, 250);
	}

	function start() {
		if (!runtime || !getModeDurationSec) return;
		if (runtime.timerState === "running") return;

		const remaining = clampInt(runtime.remainingSec, 0, 999999);
		runtime.remainingSec = remaining;

		if (runtime.endAtMs === null) {
			runtime.endAtMs = Date.now() + remaining * 1000;
		}
		runtime.timerState = "running";
		lastShownSec = null;
		ensureLoop();
		tick();
	}

	function pause() {
		if (!runtime) return;
		if (runtime.timerState !== "running") return;

		const remaining = computeRemainingSec(Date.now());
		runtime.remainingSec = remaining;
		runtime.timerState = "paused";
		runtime.endAtMs = null;
		stopLoop();
		onTick?.(remaining);
	}

	function reset() {
		if (!runtime || !getModeDurationSec) return;
		stopLoop();
		runtime.timerState = "idle";
		runtime.endAtMs = null;
		runtime.remainingSec = getModeDurationSec(runtime.mode);
		lastShownSec = null;
		onTick?.(runtime.remainingSec);
	}

	function setMode(mode) {
		if (!runtime) return;
		runtime.mode = mode;
		reset();
	}

	function skip() {
		if (!runtime) return;
		const remainingBefore = runtime.timerState === "running" ? computeRemainingSec(Date.now()) : runtime.remainingSec;
		stopLoop();
		runtime.timerState = "idle";
		runtime.endAtMs = null;
		runtime.remainingSec = 0;
		lastShownSec = 0;
		onTick?.(0);
		onFinish?.({ reason: "skip", remainingSecBeforeSkip: remainingBefore });
	}

	function hydrateFromState(nextRuntime, { getModeDurationSec: getDurationFn }) {
		runtime = nextRuntime;
		getModeDurationSec = getDurationFn;

		if (runtime.timerState === "running" && typeof runtime.endAtMs === "number") {
			lastShownSec = null;
			ensureLoop();
			tick();
		} else {
			stopLoop();
			lastShownSec = null;
			onTick?.(runtime.remainingSec);
		}
	}

	return { start, pause, reset, skip, setMode, hydrateFromState };
}
