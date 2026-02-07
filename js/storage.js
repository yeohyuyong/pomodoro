/**
 * @typedef {"focus"|"shortBreak"|"longBreak"} Mode
 * @typedef {"idle"|"running"|"paused"} TimerState
 *
 * @typedef {{
 *   durationsMin: { focus: number, shortBreak: number, longBreak: number },
 *   longBreakInterval: number,
 *   autoStartRounds: boolean,
 *   sounds: {
 *     tickEnabled: boolean,
 *     endingNotificationMin: number,
 *     background: string,
 *     volumes: { tick: number, alerts: number, bgm: number }
 *   },
 *   theme: "system"|"light"|"dark",
 *   notifications: { enabled: boolean }
 * }} Settings
 *
 * @typedef {{
 *   mode: Mode,
 *   timerState: TimerState,
 *   endAtMs: number|null,
 *   remainingSec: number,
 *   cycleCountSinceLongBreak: number,
 *   activeTaskId: string|null
 * }} Runtime
 *
 * @typedef {{ id: string, title: string, done: boolean, createdAtIso: string, order: number, estimateMin: number|null }} Task
 *
 * @typedef {{
 *   id: string,
 *   taskId: string|null,
 *   label: string,
 *   startAtIso: string,
 *   endAtIso: string,
 *   note: string
 * }} TimeBlock
 *
 * @typedef {{
 *   id: string,
 *   type: Mode,
 *   startedAtIso: string,
 *   endedAtIso: string,
 *   plannedDurationSec: number,
 *   actualDurationSec: number,
 *   taskId: string|null,
 *   note: string
 * }} LogItem
 *
 * @typedef {{
 *   version: 2,
 *   settings: Settings & {
 *     calendar?: {
 *       weekStart: "mon"|"sun"|"sat",
 *       dayStartHour: number,
 *       dayEndHour: number,
 *       slotMinutes: 15|30|60,
 *       aiMaxBlockMin: number,
 *       workHoursByDow: Array<{ enabled: boolean, startMin: number, endMin: number }>
 *     }
 *   },
 *   runtime: Runtime,
 *   tasks: Task[],
 *   logs: LogItem[],
 *   timeBlocks: TimeBlock[]
 * }} AppState
 */

export const STORAGE_KEY = "pomodorotimers:v2";
export const MIGRATED_KEY = "pomodorotimers:v2:migratedFromV1";

function clampInt(value, min, max) {
	const n = Number.parseInt(String(value), 10);
	if (Number.isNaN(n)) return min;
	return Math.max(min, Math.min(max, n));
}

function clampNumber(value, min, max, fallback) {
	const n = Number(value);
	if (!Number.isFinite(n)) return fallback;
	return Math.max(min, Math.min(max, n));
}

export function createDefaultState(nowMs = Date.now()) {
	const nowIso = new Date(nowMs).toISOString();
	/** @type {AppState} */
	const state = {
		version: 2,
		settings: {
			durationsMin: { focus: 25, shortBreak: 5, longBreak: 20 },
			longBreakInterval: 4,
			autoStartRounds: false,
			sounds: {
				tickEnabled: false,
				endingNotificationMin: 1,
				background: "None",
				volumes: { tick: 1.0, alerts: 1.0, bgm: 0.1 },
			},
			theme: "system",
			notifications: { enabled: false },
			calendar: {
				weekStart: "mon",
				dayStartHour: 7,
				dayEndHour: 24,
				slotMinutes: 30,
				aiMaxBlockMin: 90,
				workHoursByDow: Array.from({ length: 7 }, () => ({ enabled: true, startMin: 7 * 60, endMin: 24 * 60 })),
			},
		},
		runtime: {
			mode: "focus",
			timerState: "idle",
			endAtMs: null,
			remainingSec: 25 * 60,
			cycleCountSinceLongBreak: 0,
			activeTaskId: null,
		},
		tasks: [],
		logs: [],
		timeBlocks: [],
	};

	// Keep eslint/formatters happy if introduced later; use nowIso in case we add defaults.
	void nowIso;
	return state;
}

function isObject(value) {
	return typeof value === "object" && value !== null;
}

function normalizeState(state) {
	if (!isObject(state) || state.version !== 2) return null;
	if (!isObject(state.settings) || !isObject(state.runtime)) return null;

	const next = /** @type {AppState} */ (state);

	next.settings.durationsMin = next.settings.durationsMin || { focus: 25, shortBreak: 5, longBreak: 20 };
	next.settings.durationsMin.focus = clampInt(next.settings.durationsMin.focus, 1, 999);
	next.settings.durationsMin.shortBreak = clampInt(next.settings.durationsMin.shortBreak, 1, 999);
	next.settings.durationsMin.longBreak = clampInt(next.settings.durationsMin.longBreak, 1, 999);
	next.settings.longBreakInterval = clampInt(next.settings.longBreakInterval, 1, 12);
	next.settings.autoStartRounds = Boolean(next.settings.autoStartRounds);

	next.settings.sounds = next.settings.sounds || {
		tickEnabled: false,
		endingNotificationMin: 1,
		background: "None",
		volumes: { tick: 1.0, alerts: 1.0, bgm: 0.1 },
	};
	next.settings.sounds.tickEnabled = Boolean(next.settings.sounds.tickEnabled);
	next.settings.sounds.endingNotificationMin = clampInt(next.settings.sounds.endingNotificationMin, 0, 120);
	next.settings.sounds.background = typeof next.settings.sounds.background === "string" ? next.settings.sounds.background : "None";
	next.settings.sounds.volumes = next.settings.sounds.volumes || { tick: 1.0, alerts: 1.0, bgm: 0.1 };
	next.settings.sounds.volumes.tick = clampNumber(next.settings.sounds.volumes.tick, 0, 1, 1.0);
	next.settings.sounds.volumes.alerts = clampNumber(next.settings.sounds.volumes.alerts, 0, 1, 1.0);
	next.settings.sounds.volumes.bgm = clampNumber(next.settings.sounds.volumes.bgm, 0, 1, 0.1);

	next.settings.theme =
		next.settings.theme === "dark" || next.settings.theme === "light" || next.settings.theme === "system" ? next.settings.theme : "system";

	next.settings.notifications = next.settings.notifications || { enabled: false };
	next.settings.notifications.enabled = Boolean(next.settings.notifications.enabled);
	next.settings.calendar = next.settings.calendar || {
		weekStart: "mon",
		dayStartHour: 7,
		dayEndHour: 24,
		slotMinutes: 30,
		aiMaxBlockMin: 90,
		workHoursByDow: Array.from({ length: 7 }, () => ({ enabled: true, startMin: 7 * 60, endMin: 24 * 60 })),
	};
	if (next.settings.calendar.weekStart !== "sun" && next.settings.calendar.weekStart !== "sat" && next.settings.calendar.weekStart !== "mon") {
		next.settings.calendar.weekStart = "mon";
	}
	next.settings.calendar.dayStartHour = clampInt(next.settings.calendar.dayStartHour, 0, 23);
	next.settings.calendar.dayEndHour = clampInt(next.settings.calendar.dayEndHour, 1, 24);
	if (next.settings.calendar.dayEndHour <= next.settings.calendar.dayStartHour) {
		next.settings.calendar.dayEndHour = Math.min(24, next.settings.calendar.dayStartHour + 1);
	}
	const slot = Number(next.settings.calendar.slotMinutes);
	next.settings.calendar.slotMinutes = slot === 15 || slot === 60 ? slot : 30;
	{
		const defaultAi = 90;
		const rawAi = Number(next.settings.calendar.aiMaxBlockMin);
		let ai = Number.isFinite(rawAi) ? clampInt(rawAi, 30, 240) : defaultAi;
		const slotMin = next.settings.calendar.slotMinutes;
		ai = Math.round(ai / slotMin) * slotMin;
		ai = clampInt(ai, slotMin, 240);
		next.settings.calendar.aiMaxBlockMin = ai;
	}
	{
		const slotMin = next.settings.calendar.slotMinutes;
		const defaultStart = next.settings.calendar.dayStartHour * 60;
		const defaultEnd = next.settings.calendar.dayEndHour * 60;
		const rawList = Array.isArray(next.settings.calendar.workHoursByDow) ? next.settings.calendar.workHoursByDow : [];
		const normalized = [];
		for (let i = 0; i < 7; i++) {
			const raw = isObject(rawList[i]) ? rawList[i] : {};
			const enabled = raw.enabled === undefined ? true : Boolean(raw.enabled);
			const rawStart = Number(raw.startMin);
			const rawEnd = Number(raw.endMin);
			let startMin = Number.isFinite(rawStart) ? clampInt(rawStart, 0, 24 * 60) : defaultStart;
			let endMin = Number.isFinite(rawEnd) ? clampInt(rawEnd, 0, 24 * 60) : defaultEnd;

			startMin = Math.round(startMin / slotMin) * slotMin;
			endMin = Math.round(endMin / slotMin) * slotMin;
			startMin = clampInt(startMin, 0, 24 * 60);
			endMin = clampInt(endMin, 0, 24 * 60);

			if (enabled && endMin <= startMin) {
				endMin = Math.min(24 * 60, startMin + slotMin);
			}
			normalized[i] = { enabled, startMin, endMin };
		}
		next.settings.calendar.workHoursByDow = normalized;
	}

	next.runtime.mode = next.runtime.mode === "focus" || next.runtime.mode === "shortBreak" || next.runtime.mode === "longBreak" ? next.runtime.mode : "focus";
	next.runtime.timerState =
		next.runtime.timerState === "idle" || next.runtime.timerState === "running" || next.runtime.timerState === "paused" ? next.runtime.timerState : "idle";
	next.runtime.endAtMs = typeof next.runtime.endAtMs === "number" ? next.runtime.endAtMs : null;
	next.runtime.remainingSec = clampInt(next.runtime.remainingSec, 0, 999 * 60);
	next.runtime.cycleCountSinceLongBreak = clampInt(next.runtime.cycleCountSinceLongBreak, 0, 99);
	next.runtime.activeTaskId = typeof next.runtime.activeTaskId === "string" ? next.runtime.activeTaskId : null;

	next.tasks = Array.isArray(next.tasks) ? next.tasks : [];
	for (const task of next.tasks) {
		if (!isObject(task)) continue;
		const est = Number(task.estimateMin);
		task.estimateMin = Number.isFinite(est) ? clampInt(est, 0, 9999) : null;
	}
	next.logs = Array.isArray(next.logs) ? next.logs : [];
	next.timeBlocks = Array.isArray(next.timeBlocks) ? next.timeBlocks : [];
	next.timeBlocks = next.timeBlocks.filter((block) => {
		if (!isObject(block)) return false;
		if (typeof block.id !== "string") return false;
		if (typeof block.startAtIso !== "string" || typeof block.endAtIso !== "string") return false;
		const startMs = Date.parse(block.startAtIso);
		const endMs = Date.parse(block.endAtIso);
		if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return false;
		block.taskId = typeof block.taskId === "string" ? block.taskId : null;
		block.label = typeof block.label === "string" ? block.label : "";
		block.note = typeof block.note === "string" ? block.note : "";
		return true;
	});

	return next;
}

export function loadState() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return createDefaultState();
		const parsed = JSON.parse(raw);
		return normalizeState(parsed) || createDefaultState();
	} catch {
		return createDefaultState();
	}
}

export function normalizeImportedState(parsed) {
	return normalizeState(parsed);
}

function writeStateString(stateString) {
	try {
		localStorage.setItem(STORAGE_KEY, stateString);
	} catch {
		// ignore (private mode / storage full)
	}
}

let saveTimeoutId = null;
let pendingStateString = null;

export function saveState(state) {
	try {
		pendingStateString = JSON.stringify(state);
	} catch {
		return;
	}
	if (saveTimeoutId !== null) {
		clearTimeout(saveTimeoutId);
	}
	saveTimeoutId = setTimeout(() => {
		saveTimeoutId = null;
		if (pendingStateString !== null) writeStateString(pendingStateString);
	}, 250);
}

export function saveStateImmediate(state) {
	try {
		writeStateString(JSON.stringify(state));
	} catch {
		// ignore
	}
}

export function resetStateToDefaults() {
	return createDefaultState();
}
