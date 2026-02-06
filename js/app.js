import { loadState, normalizeImportedState, saveState, saveStateImmediate } from "./storage.js";
import { migrateV1ToV2IfNeeded } from "./migrate-v1.js";
import { createTimerEngine } from "./timer-engine.js";
import { computeStats, buildChartsData } from "./stats.js";
import { createSoundController } from "./sounds.js";
import { planTimeblocks } from "./ai-timeblocking.js";

/** @typedef {"focus"|"shortBreak"|"longBreak"} Mode */

migrateV1ToV2IfNeeded();

let state = loadState();

const elements = {
	nav: {
		focus: document.getElementById("pomodoros"),
		shortBreak: document.getElementById("shortBreak"),
		longBreak: document.getElementById("longBreak"),
	},
	timer: {
		timeLeft: document.getElementById("timeLeft"),
		progressRing: document.getElementById("progressRing"),
		cycleIndicator: document.getElementById("cycleIndicator"),
		activeTaskLink: document.getElementById("activeTaskLink"),
		clearActiveTaskButton: document.getElementById("clearActiveTaskButton"),
		start: document.getElementById("startButton"),
		pause: document.getElementById("stopButton"),
		reset: document.getElementById("resetButton"),
		skip: document.getElementById("skipButton"),
	},
	alert: {
		root: document.querySelector(".alert"),
		message: document.getElementById("alertMessage"),
		dismiss: document.getElementById("dismissAlertButton"),
	},
	settings: {
		focusMin: document.getElementById("pomodoroInput"),
		shortMin: document.getElementById("shortBreakInput"),
		longMin: document.getElementById("longBreakInput"),
		autoStart: document.getElementById("autoStartRoundsInput"),
		longBreakInterval: document.getElementById("longBreakIntervalInput"),
		longBreakIntervalValue: document.getElementById("sliderValue"),
		tickEnabled: document.getElementById("tickSoundInput"),
		endingNotificationMin: document.getElementById("notificationTextInput"),
		notificationsEnabled: document.getElementById("desktopNotificationsInput"),
		notificationsHint: document.getElementById("desktopNotificationsHint"),
		background: document.getElementById("backgroundMusicOptions"),
		tickVolume: document.getElementById("tickVolumeInput"),
		tickVolumeValue: document.getElementById("tickVolumeValue"),
		alertsVolume: document.getElementById("alertsVolumeInput"),
		alertsVolumeValue: document.getElementById("alertsVolumeValue"),
		bgmVolume: document.getElementById("bgmVolumeInput"),
		bgmVolumeValue: document.getElementById("bgmVolumeValue"),
		theme: document.getElementById("themeSelect"),
		saveButton: document.getElementById("saveButton"),
		exportData: document.getElementById("exportDataButton"),
		importData: document.getElementById("importDataInput"),
	},
	todo: {
		input: document.getElementById("taskInput"),
		estimateInput: document.getElementById("taskEstimateInput"),
		add: document.getElementById("addTaskButton"),
		clear: document.getElementById("clearTasksButton"),
		list: document.getElementById("listOfTasks"),
		emptyText: document.getElementById("NoTaskTodayText"),
	},
	calendar: {
		section: document.getElementById("calendarSection"),
		grid: document.getElementById("calendarGrid"),
		headerLabel: document.getElementById("calendarHeaderLabel"),
		startTime: document.getElementById("calendarStartTime"),
		endTime: document.getElementById("calendarEndTime"),
		prev: document.getElementById("calendarPrev"),
		next: document.getElementById("calendarNext"),
		today: document.getElementById("calendarToday"),
		viewWeek: document.getElementById("calendarViewWeek"),
		viewDay: document.getElementById("calendarViewDay"),
		aiPlanButton: document.getElementById("calendarAiPlanButton"),
	},
	timeblock: {
		modal: document.getElementById("timeblockModal"),
		taskSelect: document.getElementById("timeblockTaskSelect"),
		label: document.getElementById("timeblockLabel"),
		start: document.getElementById("timeblockStart"),
		end: document.getElementById("timeblockEnd"),
		note: document.getElementById("timeblockNote"),
		save: document.getElementById("timeblockSave"),
		del: document.getElementById("timeblockDelete"),
	},
	aiPlan: {
		modal: document.getElementById("aiTimeblockModal"),
		rangeLabel: document.getElementById("aiPlanRangeLabel"),
		tasksContainer: document.getElementById("aiPlanTasksContainer"),
		missingEstimates: document.getElementById("aiPlanMissingEstimates"),
		maxBlockInput: document.getElementById("aiPlanMaxBlockInput"),
		previewSummary: document.getElementById("aiPlanPreviewSummary"),
		previewContainer: document.getElementById("aiPlanPreviewContainer"),
		previewButton: document.getElementById("aiPlanPreviewButton"),
		applyButton: document.getElementById("aiPlanApplyButton"),
		undoButton: document.getElementById("aiPlanUndoButton"),
	},
	log: {
		clear: document.getElementById("clearButton"),
		tableBody: document.getElementById("locationUpdateLog"),
		emptyText: document.getElementById("NoDataLoggedText"),
	},
	stats: {
		panel: document.getElementById("statsPanel"),
		hint: document.getElementById("statsHint"),
		focusTime: document.getElementById("statsFocusTime"),
		focusSessions: document.getElementById("statsFocusSessions"),
		breakTime: document.getElementById("statsBreakTime"),
		totalTime: document.getElementById("statsTotalTime"),
		bar: document.getElementById("statsBarChart"),
		donut: document.getElementById("statsDonutChart"),
		heatmap: document.getElementById("statsHeatmap"),
		heatmapHint: document.getElementById("statsHeatmapHint"),
		tasksBody: document.getElementById("statsTasksBody"),
		tasksEmpty: document.getElementById("statsTasksEmpty"),
	},
	summary: {
		text: document.getElementById("summaryText"),
		focusMinutes: document.getElementById("summaryFocusMinutes"),
		focusSessions: document.getElementById("summaryFocusSessions"),
		activeTask: document.getElementById("summaryActiveTask"),
	},
	scroll: {
		indicator: document.getElementById("scrollIndicator"),
		backToTop: document.querySelector(".back-to-top-button"),
		backToTopWrap: document.querySelector(".scrolltop-wrap"),
	},
};

const modeColors = {
	focus: "#d96b4f",
	shortBreak: "#3f6d5b",
	longBreak: "#f0b45b",
};

let calendarView = "week";
let calendarCursorDate = new Date();
const CALENDAR_SLOT_HEIGHT = 28;
let calendarEditingBlockId = null;
let calendarNowLineTimerId = null;
let calendarNowLineContext = null;
let aiDraftPlan = null;
let aiLastAppliedBlockIds = [];

function getModeDurationSec(mode) {
	const mins = state.settings.durationsMin;
	if (mode === "focus") return mins.focus * 60;
	if (mode === "shortBreak") return mins.shortBreak * 60;
	return mins.longBreak * 60;
}

function modeLabel(mode) {
	if (mode === "focus") return "Focus";
	if (mode === "shortBreak") return "Short Break";
	return "Long Break";
}

function showAlert({ variant, html }) {
	const root = elements.alert.root;
	if (!root) return;

	root.classList.remove("alert-danger", "alert-success", "alert-primary");
	root.classList.add(variant);
	elements.alert.message.innerHTML = html;
	root.style.display = "block";

	window.clearTimeout(showAlert._t);
	showAlert._t = window.setTimeout(dismissAlert, 3000);
}
showAlert._t = null;

function dismissAlert() {
	const root = elements.alert.root;
	if (!root) return;
	root.style.display = "none";
}

function secondsToClock(totalSec) {
	const m = Math.floor(totalSec / 60);
	const s = totalSec % 60;
	return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function setNavActive(mode) {
	const nav = elements.nav;
	nav.focus.classList.toggle("active", mode === "focus");
	nav.shortBreak.classList.toggle("active", mode === "shortBreak");
	nav.longBreak.classList.toggle("active", mode === "longBreak");
}

function updateDocumentTitle(remainingSec) {
	if (state.runtime.timerState === "running") {
		document.title = `${secondsToClock(remainingSec)} - ${modeLabel(state.runtime.mode)}`;
	} else {
		document.title = "PomodoroTimers";
	}
}

function updateProgressRing(remainingSec) {
	const total = getModeDurationSec(state.runtime.mode) || 1;
	const elapsed = Math.max(0, total - remainingSec);
	const progress = Math.max(0, Math.min(1, elapsed / total));
	elements.timer.progressRing?.style?.setProperty("--progress", String(progress));
	elements.timer.progressRing?.style?.setProperty("--progress-color", modeColors[state.runtime.mode]);
}

function updateCycleIndicator() {
	const interval = state.settings.longBreakInterval;
	const count = state.runtime.cycleCountSinceLongBreak;
	const cycleIndex = state.runtime.mode === "focus" ? count + 1 : count;
	elements.timer.cycleIndicator.textContent = `Cycle: ${Math.min(cycleIndex, interval)} / ${interval}`;
}

function renderActiveTask() {
	const link = elements.timer.activeTaskLink;
	const clearBtn = elements.timer.clearActiveTaskButton;
	if (!link) return;

	const title = getActiveTaskTitle();
	link.textContent = title ? `Task: ${title}` : "Task: None";

	const hasActive = Boolean(state.runtime.activeTaskId) && Boolean(title);
	if (clearBtn) clearBtn.disabled = !hasActive;
}

function updateTimerButtons() {
	const { timerState } = state.runtime;
	if (timerState === "paused") {
		elements.timer.start.textContent = "Resume";
	} else {
		elements.timer.start.textContent = "Start";
	}

	elements.timer.pause.textContent = "Pause";
	elements.timer.pause.disabled = timerState !== "running";
}

function renderTimer(remainingSec = state.runtime.remainingSec) {
	elements.timer.timeLeft.textContent = secondsToClock(remainingSec);
	setNavActive(state.runtime.mode);
	updateProgressRing(remainingSec);
	updateCycleIndicator();
	renderActiveTask();
	updateTimerButtons();
	updateDocumentTitle(remainingSec);
}

function uuid(prefix) {
	if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
	return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function isDesktopNotifSupported() {
	return (
		typeof window !== "undefined" &&
		"Notification" in window &&
		typeof Notification === "function" &&
		typeof Notification.requestPermission === "function" &&
		typeof Notification.permission === "string"
	);
}

function canSendDesktopNotif() {
	if (!isDesktopNotifSupported()) return false;
	if (!state?.settings?.notifications?.enabled) return false;
	if (Notification.permission !== "granted") return false;
	const isVisible =
		typeof document.visibilityState === "string" ? document.visibilityState === "visible" : typeof document.hidden === "boolean" ? !document.hidden : true;
	return !isVisible;
}

function getActiveTaskTitle() {
	const taskId = state.runtime.activeTaskId;
	if (!taskId) return "";
	const task = state.tasks.find((t) => t.id === taskId);
	return typeof task?.title === "string" ? task.title : "";
}

function sendDesktopNotif({ title, body, tag }) {
	if (!canSendDesktopNotif()) return;
	try {
		const notif = new Notification(title, { body, icon: "assets/img/logo.png", tag });
		notif.onclick = () => {
			try {
				window.focus();
			} catch {
				// ignore
			}
			try {
				notif.close();
			} catch {
				// ignore
			}
		};
	} catch {
		// ignore
	}
}

async function requestDesktopNotifPermission() {
	if (!isDesktopNotifSupported()) return "unsupported";

	try {
		const res = Notification.requestPermission();
		if (typeof res === "string") return res;
		if (res && typeof res.then === "function") return await res;
	} catch {
		// fall through
	}

	try {
		return await new Promise((resolve) => Notification.requestPermission((p) => resolve(p)));
	} catch {
		return "default";
	}
}

function addLog({ type, plannedDurationSec, actualDurationSec, taskId, note }) {
	const endedAtIso = new Date().toISOString();
	const startedAtIso = new Date(Date.now() - actualDurationSec * 1000).toISOString();
	state.logs.unshift({
		id: uuid("log"),
		type,
		startedAtIso,
		endedAtIso,
		plannedDurationSec,
		actualDurationSec,
		taskId: taskId || null,
		note: note || "",
	});
}

function nextModeAfterComplete(currentMode) {
	if (currentMode === "focus") {
		const interval = state.settings.longBreakInterval;
		if (state.runtime.cycleCountSinceLongBreak >= interval - 1) return "longBreak";
		return "shortBreak";
	}
	return "focus";
}

function transitionToNextMode() {
	const current = state.runtime.mode;
	if (current === "focus") {
		if (state.runtime.cycleCountSinceLongBreak >= state.settings.longBreakInterval - 1) {
			state.runtime.cycleCountSinceLongBreak = 0;
			state.runtime.mode = "longBreak";
		} else {
			state.runtime.cycleCountSinceLongBreak += 1;
			state.runtime.mode = "shortBreak";
		}
	} else {
		state.runtime.mode = "focus";
	}

	resetRoundWarningState();
	timerEngine.setMode(state.runtime.mode);
	saveState(state);
	renderAll();

	if (state.settings.autoStartRounds) {
		timerEngine.start();
		saveState(state);
	}
}

const soundController = createSoundController(state.settings);

let lastOnTickRemainingSec = null;
let warningSentThisRound = false;

function resetRoundWarningState() {
	lastOnTickRemainingSec = null;
	warningSentThisRound = false;
}

const timerEngine = createTimerEngine({
	onTick: (remainingSec) => {
		renderTimer(remainingSec);
		const notifMin = Number(state.settings.sounds.endingNotificationMin || 0);
		if (state.runtime.timerState === "running") {
			soundController.syncRunning(true);
			soundController.playTick(state.settings.sounds.tickEnabled && remainingSec > 0);
			if (notifMin > 0 && remainingSec === notifMin * 60) soundController.playNotification();
		} else {
			soundController.syncRunning(false);
		}

		if (state.runtime.timerState === "running") {
			const thresholdSec = Math.round(Math.max(0, notifMin) * 60);
			if (
				thresholdSec > 0 &&
				remainingSec > 0 &&
				!warningSentThisRound &&
				typeof lastOnTickRemainingSec === "number" &&
				lastOnTickRemainingSec > thresholdSec &&
				remainingSec <= thresholdSec
			) {
				const taskTitle = getActiveTaskTitle();
				const taskPart = taskTitle ? ` — ${taskTitle}` : "";
				sendDesktopNotif({
					title: `${modeLabel(state.runtime.mode)} ending soon`,
					body: `About ${notifMin} min left${taskPart}`,
					tag: `pomodorotimers:warning:${state.runtime.mode}`,
				});
				warningSentThisRound = true;
			}
			lastOnTickRemainingSec = remainingSec;
		} else {
			lastOnTickRemainingSec = null;
		}
	},
	onFinish: (payload) => {
		const reason = payload?.reason;
		soundController.syncRunning(false);

		const type = state.runtime.mode;
		const nextMode = nextModeAfterComplete(type);
		const plannedDurationSec = getModeDurationSec(type);
		const actualDurationSec =
			reason === "skip"
				? Math.max(0, plannedDurationSec - Number(payload?.remainingSecBeforeSkip ?? plannedDurationSec))
				: plannedDurationSec;

		if (reason === "complete") {
			soundController.playAlert(type);
		}

		if (reason === "complete") {
			const taskTitle = getActiveTaskTitle();
			sendDesktopNotif({
				title: `${modeLabel(type)} complete`,
				body: `Next: ${modeLabel(nextMode)}.${taskTitle ? ` ${taskTitle}` : ""}`,
				tag: `pomodorotimers:complete:${type}`,
			});

			if (type === "focus") {
				showAlert({ variant: "alert-danger", html: "<strong>Time is up!</strong> Let's take a break" });
			} else if (type === "shortBreak") {
				showAlert({ variant: "alert-success", html: "<strong>Short break over!</strong> Let's get back to work" });
			} else {
				showAlert({ variant: "alert-primary", html: "<strong>Long break over!</strong> Let's get back to work" });
			}
		}

		if (reason === "skip" && actualDurationSec > 0) {
			addLog({
				type,
				plannedDurationSec,
				actualDurationSec,
				taskId: state.runtime.activeTaskId,
				note: "[skipped]",
			});
			saveState(state);
			renderLogs();
		}

		if (reason === "complete") {
			addLog({
				type,
				plannedDurationSec,
				actualDurationSec: plannedDurationSec,
				taskId: state.runtime.activeTaskId,
				note: "",
			});
			saveState(state);
			renderLogs();
		}

		transitionToNextMode();
	},
});

function applyResolvedTheme(resolved) {
	document.documentElement.dataset.theme = resolved;
	if (resolved === "dark") document.documentElement.dataset.bsTheme = "dark";
	else delete document.documentElement.dataset.bsTheme;
}

function updateDesktopNotificationsUi() {
	const input = elements.settings.notificationsEnabled;
	const hint = elements.settings.notificationsHint;
	if (!input || !hint) return;

	if (!isDesktopNotifSupported()) {
		input.disabled = true;
		input.checked = false;
		hint.textContent = "Desktop notifications aren't supported in this browser.";
		return;
	}

	input.disabled = false;
	const perm = Notification.permission;
	if (perm === "denied") {
		hint.textContent = "Permission is blocked in your browser settings.";
	} else if (perm === "default") {
		hint.textContent = "Enable to request permission.";
	} else {
		hint.textContent = "";
	}
}

const systemThemeMedia = window.matchMedia?.("(prefers-color-scheme: dark)");

function applyThemeSetting() {
	const setting = state.settings.theme;
	if (setting === "system") {
		applyResolvedTheme(systemThemeMedia?.matches ? "dark" : "light");
	} else {
		applyResolvedTheme(setting);
	}
}

systemThemeMedia?.addEventListener?.("change", () => {
	if (state.settings.theme === "system") applyThemeSetting();
});

function renderSettings() {
	const s = state.settings;
	elements.settings.focusMin.value = s.durationsMin.focus;
	elements.settings.shortMin.value = s.durationsMin.shortBreak;
	elements.settings.longMin.value = s.durationsMin.longBreak;
	elements.settings.autoStart.checked = s.autoStartRounds;

	elements.settings.longBreakInterval.value = s.longBreakInterval;
	elements.settings.longBreakIntervalValue.textContent = s.longBreakInterval;

	elements.settings.tickEnabled.checked = s.sounds.tickEnabled;
	elements.settings.endingNotificationMin.value = s.sounds.endingNotificationMin;
	if (elements.settings.notificationsEnabled) {
		const wantsEnabled = Boolean(s.notifications?.enabled);
		const permitted = isDesktopNotifSupported() && Notification.permission === "granted";
		if (wantsEnabled && !permitted) {
			state.settings.notifications.enabled = false;
			elements.settings.notificationsEnabled.checked = false;
			saveState(state);
		} else {
			elements.settings.notificationsEnabled.checked = wantsEnabled;
		}
	}
	elements.settings.background.value = s.sounds.background;

	const toPct = (v, fallbackPct) => {
		const n = Number(v);
		if (!Number.isFinite(n)) return fallbackPct;
		return Math.round(Math.max(0, Math.min(1, n)) * 100);
	};
	if (elements.settings.tickVolume) {
		const pct = toPct(s.sounds?.volumes?.tick, 100);
		elements.settings.tickVolume.value = String(pct);
		if (elements.settings.tickVolumeValue) elements.settings.tickVolumeValue.textContent = `${pct}%`;
	}
	if (elements.settings.alertsVolume) {
		const pct = toPct(s.sounds?.volumes?.alerts, 100);
		elements.settings.alertsVolume.value = String(pct);
		if (elements.settings.alertsVolumeValue) elements.settings.alertsVolumeValue.textContent = `${pct}%`;
	}
	if (elements.settings.bgmVolume) {
		const pct = toPct(s.sounds?.volumes?.bgm, 10);
		elements.settings.bgmVolume.value = String(pct);
		if (elements.settings.bgmVolumeValue) elements.settings.bgmVolumeValue.textContent = `${pct}%`;
	}

	elements.settings.theme.value = s.theme;

	updateDesktopNotificationsUi();
}

function logDurationSec(log) {
	const actual = Number(log?.actualDurationSec);
	if (Number.isFinite(actual) && actual >= 0) return actual;
	const planned = Number(log?.plannedDurationSec);
	if (Number.isFinite(planned) && planned >= 0) return planned;
	const started = Date.parse(log?.startedAtIso);
	const ended = Date.parse(log?.endedAtIso);
	if (Number.isFinite(started) && Number.isFinite(ended) && ended >= started) return Math.round((ended - started) / 1000);
	return 0;
}

function getTaskFocusMinutes(taskId) {
	let totalSec = 0;
	for (const log of state.logs) {
		if (!log || typeof log !== "object") continue;
		if (log.type !== "focus") continue;
		if (log.taskId !== taskId) continue;
		totalSec += logDurationSec(log);
	}
	return Math.round(totalSec / 60);
}

function renderTasks() {
	const tasks = [...state.tasks].sort((a, b) => a.order - b.order);
	elements.todo.list.innerHTML = "";

	if (tasks.length === 0) {
		elements.todo.emptyText.style.display = "block";
	} else {
		elements.todo.emptyText.style.display = "none";
	}

	for (const task of tasks) {
		const li = document.createElement("li");
		li.className = "list-group-item d-flex align-items-center gap-2";
		li.dataset.taskId = task.id;
		if (task.done) li.classList.add("done");
		if (state.runtime.activeTaskId === task.id) li.classList.add("task-active");

		const toggle = document.createElement("button");
		toggle.type = "button";
		toggle.className = "btn btn-sm btn-outline-secondary";
		toggle.dataset.action = "toggle-done";
		toggle.setAttribute("aria-label", task.done ? "Mark task as not done" : "Mark task as done");
		toggle.innerHTML = task.done ? '<i class="fas fa-check"></i>' : '<i class="far fa-circle"></i>';

		const title = document.createElement("span");
		title.className = "flex-grow-1";
		title.style.cursor = "pointer";
		title.dataset.action = "select-task";
		title.textContent = task.title;

		const meta = document.createElement("div");
		meta.className = "task-meta";
		if (typeof task.estimateMin === "number") {
			const spent = getTaskFocusMinutes(task.id);
			const remaining = Math.max(0, task.estimateMin - spent);
			meta.textContent = `Est ${task.estimateMin} min · ${remaining} min left`;
		} else {
			meta.textContent = "No estimate";
		}

		const del = document.createElement("button");
		del.type = "button";
		del.className = "btn btn-sm btn-outline-secondary";
		del.dataset.action = "delete-task";
		del.setAttribute("aria-label", "Delete task");
		del.innerHTML = '<i class="fas fa-trash-alt"></i>';

		li.append(toggle, title, meta, del);
		elements.todo.list.appendChild(li);
	}

	renderSummaryCard();
	renderCalendar();
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "2-digit" });
const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

function renderLogs() {
	elements.log.tableBody.innerHTML = "";
	if (state.logs.length === 0) {
		elements.log.emptyText.style.display = "block";
	} else {
		elements.log.emptyText.style.display = "none";
	}

	for (const log of state.logs) {
		const tr = document.createElement("tr");
		tr.dataset.logId = log.id;

		const started = new Date(log.startedAtIso);
		const ended = new Date(log.endedAtIso);
		const plannedMin = Math.round((log.plannedDurationSec || 0) / 60);

		tr.innerHTML = `
			<th scope="row">${modeLabel(log.type)}</th>
			<td>${dateFormatter.format(started)}</td>
			<td>${timeFormatter.format(started)}</td>
			<td>${timeFormatter.format(ended)}</td>
			<td>${plannedMin} min</td>
			<td>
				<input class="form-control" type="text" value="${escapeAttribute(log.note || "")}" data-action="edit-note" />
			</td>
			<td>
				<button type="button" class="btn btn-sm btn-outline-secondary" data-action="delete-log" aria-label="Delete log">
					<i class="fas fa-trash-alt"></i>
				</button>
			</td>
		`;
		elements.log.tableBody.appendChild(tr);
	}

	renderStats();
	renderSummaryCard();
}

function escapeAttribute(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

function startOfLocalDayMs(date) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0).getTime();
}

function filterLogsByRange(range) {
	const nowMs = Date.now();
	const now = new Date(nowMs);
	const startToday = startOfLocalDayMs(now);

	let startMs = 0;
	if (range === "today") startMs = startToday;
	if (range === "7d") startMs = startToday - 6 * 24 * 60 * 60 * 1000;
	if (range === "30d") startMs = startToday - 29 * 24 * 60 * 60 * 1000;

	if (range === "all") return state.logs;
	return state.logs.filter((l) => Date.parse(l.startedAtIso) >= startMs);
}

let statsRange = "all";

function formatMinutes(sec) {
	return `${Math.round(sec / 60)} min`;
}

function toLocalDayKey(date) {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function rangeDaysToShow(range) {
	if (range === "today") return 1;
	if (range === "7d") return 7;
	if (range === "30d") return 30;
	return 365;
}

function startOfLocalDay(date) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function addLocalDays(date, days) {
	const d = new Date(date);
	d.setDate(d.getDate() + days);
	return d;
}

function getCalendarSettings() {
	const c = state.settings?.calendar || { weekStart: "mon", dayStartHour: 7, dayEndHour: 24, slotMinutes: 30 };
	return {
		weekStart: c.weekStart === "sun" || c.weekStart === "sat" || c.weekStart === "mon" ? c.weekStart : "mon",
		dayStartHour: Number.isFinite(Number(c.dayStartHour)) ? Number(c.dayStartHour) : 7,
		dayEndHour: Number.isFinite(Number(c.dayEndHour)) ? Number(c.dayEndHour) : 24,
		slotMinutes: c.slotMinutes === 15 || c.slotMinutes === 60 ? c.slotMinutes : 30,
	};
}

function startOfWeek(date, weekStart) {
	const day = startOfLocalDay(date);
	const dow = day.getDay();
	let offset = 0;
	if (weekStart === "mon") offset = (dow + 6) % 7;
	if (weekStart === "sun") offset = dow;
	if (weekStart === "sat") offset = (dow + 1) % 7;
	return addLocalDays(day, -offset);
}

function formatTimeLabel(minutes) {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (h === 24 && m === 0) return "24:00";
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function minutesFromTimeInput(value, allowMidnight) {
	if (!value || typeof value !== "string") return null;
	const match = value.match(/^(\d{2}):(\d{2})$/);
	if (!match) return null;
	const h = Number(match[1]);
	const m = Number(match[2]);
	if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
	if (allowMidnight && h === 0 && m === 0) return 24 * 60;
	return Math.min(24 * 60, h * 60 + m);
}

function timeInputFromMinutes(minutes) {
	if (minutes >= 24 * 60) return "00:00";
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function hourFromTimeInput(value, allowMidnight) {
	const min = minutesFromTimeInput(value, allowMidnight);
	if (min === null) return null;
	return Math.floor(min / 60);
}

function syncCalendarHourInputs(settings) {
	if (!elements.calendar.startTime || !elements.calendar.endTime) return;
	const startMin = settings.dayStartHour * 60;
	const endMin = settings.dayEndHour * 60;
	elements.calendar.startTime.value = timeInputFromMinutes(startMin);
	elements.calendar.endTime.value = timeInputFromMinutes(endMin);
}

function dateFromDayKey(dayKey) {
	const [y, m, d] = String(dayKey).split("-").map((v) => Number(v));
	if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return new Date();
	return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function minutesToIso(dayDate, minutes) {
	if (minutes >= 24 * 60) {
		const nextDay = addLocalDays(dayDate, 1);
		return new Date(nextDay.getFullYear(), nextDay.getMonth(), nextDay.getDate(), 0, 0, 0, 0).toISOString();
	}
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), h, m, 0, 0).toISOString();
}

function blockMinutes(block) {
	const start = new Date(block.startAtIso);
	const end = new Date(block.endAtIso);
	const dayKey = toLocalDayKey(start);
	const startMin = start.getHours() * 60 + start.getMinutes();
	let endMin = end.getHours() * 60 + end.getMinutes();
	if (toLocalDayKey(end) !== dayKey && endMin === 0) endMin = 24 * 60;
	return { dayKey, startMin, endMin };
}

function overlapsBlock(dayKey, startMin, endMin, excludeId) {
	for (const block of state.timeBlocks || []) {
		if (!block || block.id === excludeId) continue;
		const m = blockMinutes(block);
		if (m.dayKey !== dayKey) continue;
		if (Math.max(startMin, m.startMin) < Math.min(endMin, m.endMin)) return true;
	}
	return false;
}

function clampMinutes(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

function ceilToMultiple(value, multiple) {
	if (!Number.isFinite(value) || !Number.isFinite(multiple) || multiple <= 0) return value;
	return Math.ceil(value / multiple) * multiple;
}

function floorToMultiple(value, multiple) {
	if (!Number.isFinite(value) || !Number.isFinite(multiple) || multiple <= 0) return value;
	return Math.floor(value / multiple) * multiple;
}

function getPlanningDaysForCurrentView() {
	return getCalendarDays();
}

function computeAlreadyPlannedMinByTaskIdInRange(dayKeysSet, dayStartMin, dayEndMin) {
	/** @type {Map<string, number>} */
	const byTaskId = new Map();
	for (const block of state.timeBlocks || []) {
		if (!block || typeof block !== "object") continue;
		if (typeof block.taskId !== "string" || !block.taskId) continue;

		const m = blockMinutes(block);
		if (!dayKeysSet.has(m.dayKey)) continue;

		const clippedStart = Math.max(m.startMin, dayStartMin);
		const clippedEnd = Math.min(m.endMin, dayEndMin);
		const dur = clippedEnd - clippedStart;
		if (dur <= 0) continue;

		byTaskId.set(block.taskId, (byTaskId.get(block.taskId) || 0) + dur);
	}
	for (const [taskId, minutes] of byTaskId.entries()) {
		byTaskId.set(taskId, Math.round(minutes));
	}
	return byTaskId;
}

function computeFreeIntervalsByDayKey(dayKeysInOrder, { dayStartMin, dayEndMin, slotMinutes }) {
	/** @type {Map<string, Array<{ startMin: number, endMin: number }>>} */
	const busyByDayKey = new Map();
	const dayKeysSet = new Set(dayKeysInOrder);
	for (const dayKey of dayKeysInOrder) busyByDayKey.set(dayKey, []);

	for (const block of state.timeBlocks || []) {
		if (!block || typeof block !== "object") continue;
		const m = blockMinutes(block);
		if (!dayKeysSet.has(m.dayKey)) continue;

		const clippedStart = Math.max(m.startMin, dayStartMin);
		const clippedEnd = Math.min(m.endMin, dayEndMin);
		if (clippedEnd <= clippedStart) continue;

		busyByDayKey.get(m.dayKey)?.push({ startMin: clippedStart, endMin: clippedEnd });
	}

	/** @type {Record<string, Array<{ startMin: number, endMin: number }>>} */
	const freeByDayKey = {};

	for (const dayKey of dayKeysInOrder) {
		const busy = busyByDayKey.get(dayKey) || [];
		busy.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

		/** @type {Array<{ startMin: number, endMin: number }>} */
		const merged = [];
		for (const interval of busy) {
			const last = merged[merged.length - 1];
			if (!last || interval.startMin > last.endMin) {
				merged.push({ startMin: interval.startMin, endMin: interval.endMin });
			} else {
				last.endMin = Math.max(last.endMin, interval.endMin);
			}
		}

		/** @type {Array<{ startMin: number, endMin: number }>} */
		const free = [];
		let cursor = dayStartMin;
		for (const interval of merged) {
			if (interval.startMin > cursor) free.push({ startMin: cursor, endMin: interval.startMin });
			cursor = Math.max(cursor, interval.endMin);
		}
		if (cursor < dayEndMin) free.push({ startMin: cursor, endMin: dayEndMin });

		const snapped = free
			.map((f) => ({
				startMin: ceilToMultiple(f.startMin, slotMinutes),
				endMin: floorToMultiple(f.endMin, slotMinutes),
			}))
			.filter((f) => f.endMin - f.startMin >= slotMinutes);

		freeByDayKey[dayKey] = snapped;
	}

	return freeByDayKey;
}

function buildAiPlanModel() {
	const settings = getCalendarSettings();
	const dayStartMin = settings.dayStartHour * 60;
	const dayEndMin = settings.dayEndHour * 60;
	const slotMinutes = settings.slotMinutes;
	const maxBlockMin = typeof state.settings?.calendar?.aiMaxBlockMin === "number" ? state.settings.calendar.aiMaxBlockMin : 90;

	const days = getPlanningDaysForCurrentView();
	const dayKeysInOrder = days.map((d) => toLocalDayKey(d));
	const dayKeysSet = new Set(dayKeysInOrder);

	const plannedMinByTaskId = computeAlreadyPlannedMinByTaskIdInRange(dayKeysSet, dayStartMin, dayEndMin);

	const tasksSorted = [...state.tasks].sort((a, b) => a.order - b.order);
	const schedulable = [];
	const missingEstimates = [];

	for (const task of tasksSorted) {
		if (!task || typeof task !== "object") continue;
		if (task.done) continue;

		if (typeof task.estimateMin !== "number") {
			missingEstimates.push({ id: task.id, title: task.title });
			continue;
		}

		const estimateMin = Number(task.estimateMin);
		const spentFocusMin = getTaskFocusMinutes(task.id);
		const workRemainingMin = Math.max(0, Math.round(estimateMin) - spentFocusMin);
		const alreadyPlannedMin = plannedMinByTaskId.get(task.id) || 0;
		const toPlanMin = Math.max(0, workRemainingMin - alreadyPlannedMin);

		schedulable.push({
			id: task.id,
			title: task.title,
			toPlanMin,
		});
	}

	return {
		days,
		dayKeysInOrder,
		rangeLabel: calendarRangeLabel(days),
		slotMinutes,
		dayStartMin,
		dayEndMin,
		maxBlockMin,
		schedulable,
		missingEstimates,
	};
}

function clearAiPlanPreview() {
	const ai = elements.aiPlan;
	aiDraftPlan = null;
	if (ai.previewSummary) ai.previewSummary.textContent = "";
	if (ai.previewContainer) ai.previewContainer.innerHTML = "";
	if (ai.applyButton) ai.applyButton.disabled = true;
}

function renderAiPlanPreview({ proposed, unscheduled, dayKeysInOrder }) {
	const ai = elements.aiPlan;
	if (!ai.previewContainer) return;
	ai.previewContainer.innerHTML = "";

	const taskTitleById = new Map(state.tasks.map((t) => [t.id, t.title]));

	const totalMin = proposed.reduce((sum, b) => sum + (b.endMin - b.startMin), 0);
	if (ai.previewSummary) {
		ai.previewSummary.textContent = proposed.length ? `${proposed.length} blocks · ${totalMin} min` : "No blocks";
	}

	if (proposed.length === 0) {
		const empty = document.createElement("div");
		empty.className = "small text-muted mt-2";
		empty.textContent = "No free time to schedule (or nothing selected).";
		ai.previewContainer.appendChild(empty);
		return;
	}

	/** @type {Map<string, Array<{ dayKey: string, startMin: number, endMin: number, taskId: string }>>} */
	const byDay = new Map();
	for (const b of proposed) {
		if (!byDay.has(b.dayKey)) byDay.set(b.dayKey, []);
		byDay.get(b.dayKey).push(b);
	}
	for (const [dayKey, blocks] of byDay.entries()) {
		blocks.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
		byDay.set(dayKey, blocks);
	}

	for (const dayKey of dayKeysInOrder) {
		const blocks = byDay.get(dayKey);
		if (!blocks || blocks.length === 0) continue;

		const section = document.createElement("div");
		section.className = "mb-3";
		const title = document.createElement("div");
		title.className = "fw-semibold";
		title.textContent = calendarDayLabel(dateFromDayKey(dayKey));
		section.appendChild(title);

		const list = document.createElement("ul");
		list.className = "list-group mt-2";
		for (const b of blocks) {
			const li = document.createElement("li");
			li.className = "list-group-item d-flex justify-content-between align-items-start gap-2";
			const left = document.createElement("div");
			left.className = "flex-grow-1";
			const taskTitle = taskTitleById.get(b.taskId) || "Task";
			left.textContent = taskTitle;

			const right = document.createElement("div");
			right.className = "small text-muted text-nowrap";
			right.textContent = `${formatTimeLabel(b.startMin)}-${formatTimeLabel(b.endMin)}`;

			li.append(left, right);
			list.appendChild(li);
		}
		section.appendChild(list);
		ai.previewContainer.appendChild(section);
	}

	if (unscheduled.length) {
		const wrap = document.createElement("div");
		wrap.className = "small text-muted mt-2";
		const parts = unscheduled
			.map((u) => {
				const t = taskTitleById.get(u.taskId) || u.taskId;
				return `${t}: ${u.remainingMin} min`;
			})
			.join(" · ");
		wrap.textContent = `Unscheduled: ${parts}`;
		ai.previewContainer.appendChild(wrap);
	}
}

function renderAiPlanModal() {
	const ai = elements.aiPlan;
	if (!ai.modal || !ai.tasksContainer || !ai.missingEstimates || !ai.maxBlockInput || !ai.rangeLabel) return;

	clearAiPlanPreview();

	const model = buildAiPlanModel();
	ai.rangeLabel.textContent = model.rangeLabel;

	ai.maxBlockInput.min = String(model.slotMinutes);
	ai.maxBlockInput.max = "240";
	ai.maxBlockInput.step = String(model.slotMinutes);
	ai.maxBlockInput.value = String(model.maxBlockMin);

	ai.tasksContainer.innerHTML = "";
	for (const t of model.schedulable) {
		const id = `aiPlanTask_${t.id}`;

		const row = document.createElement("div");
		row.className = "form-check d-flex align-items-center justify-content-between gap-2";

		const left = document.createElement("div");
		left.className = "d-flex align-items-center gap-2 flex-grow-1";

		const input = document.createElement("input");
		input.type = "checkbox";
		input.className = "form-check-input";
		input.id = id;
		input.dataset.taskId = t.id;
		input.dataset.toPlanMin = String(t.toPlanMin);
		input.checked = t.toPlanMin > 0;
		input.disabled = t.toPlanMin <= 0;
		input.addEventListener("change", clearAiPlanPreview);

		const label = document.createElement("label");
		label.className = "form-check-label";
		label.setAttribute("for", id);
		label.textContent = t.title;

		left.append(input, label);

		const right = document.createElement("span");
		right.className = "small text-muted text-nowrap";
		right.textContent = `${t.toPlanMin} min`;

		row.append(left, right);
		ai.tasksContainer.appendChild(row);
	}

	if (model.schedulable.length === 0) {
		const empty = document.createElement("div");
		empty.className = "small text-muted";
		empty.textContent = "No tasks with estimates yet.";
		ai.tasksContainer.appendChild(empty);
	}

	if (model.missingEstimates.length === 0) {
		ai.missingEstimates.textContent = "None";
	} else {
		ai.missingEstimates.innerHTML = "";
		const ul = document.createElement("ul");
		ul.className = "mb-0";
		for (const t of model.missingEstimates) {
			const li = document.createElement("li");
			li.textContent = t.title;
			ul.appendChild(li);
		}
		ai.missingEstimates.appendChild(ul);
	}

	if (ai.undoButton) ai.undoButton.disabled = aiLastAppliedBlockIds.length === 0;
}

function getAiPlanSelectedTasks() {
	const ai = elements.aiPlan;
	if (!ai.tasksContainer) return [];
	const inputs = [...ai.tasksContainer.querySelectorAll('input[type="checkbox"][data-task-id]')];
	return inputs
		.filter((el) => el instanceof HTMLInputElement && el.checked && !el.disabled)
		.map((el) => ({
			taskId: el.dataset.taskId,
			toPlanMin: Number(el.dataset.toPlanMin || 0),
		}))
		.filter((t) => typeof t.taskId === "string" && t.taskId && Number.isFinite(t.toPlanMin) && t.toPlanMin > 0);
}

function generateAiDraftPlan() {
	const ai = elements.aiPlan;
	if (!ai.applyButton) return;

	clearAiPlanPreview();

	const model = buildAiPlanModel();
	const tasksToPlan = getAiPlanSelectedTasks();
	if (tasksToPlan.length === 0) {
		renderAiPlanPreview({ proposed: [], unscheduled: [], dayKeysInOrder: model.dayKeysInOrder });
		return;
	}

	const freeIntervalsByDayKey = computeFreeIntervalsByDayKey(model.dayKeysInOrder, {
		dayStartMin: model.dayStartMin,
		dayEndMin: model.dayEndMin,
		slotMinutes: model.slotMinutes,
	});

	const { proposed, unscheduled } = planTimeblocks({
		dayKeysInOrder: model.dayKeysInOrder,
		freeIntervalsByDayKey,
		tasksToPlan,
		slotMinutes: model.slotMinutes,
		maxBlockMin: model.maxBlockMin,
	});

	aiDraftPlan = {
		createdAtIso: new Date().toISOString(),
		dayKeysInOrder: model.dayKeysInOrder,
		dayStartMin: model.dayStartMin,
		dayEndMin: model.dayEndMin,
		slotMinutes: model.slotMinutes,
		proposed,
		unscheduled,
	};

	renderAiPlanPreview({ proposed, unscheduled, dayKeysInOrder: model.dayKeysInOrder });
	ai.applyButton.disabled = proposed.length === 0;
}

function applyAiDraftPlan() {
	if (!aiDraftPlan || !aiDraftPlan.proposed?.length) return;

	const stamp = new Date().toISOString();
	const note = `[AI plan] ${stamp}`;

	// Validate against current calendar in case it changed after preview.
	for (const p of aiDraftPlan.proposed) {
		if (overlapsBlock(p.dayKey, p.startMin, p.endMin, null)) {
			showAlert({ variant: "alert-danger", html: "<strong>Calendar changed.</strong> Please preview again before applying." });
			clearAiPlanPreview();
			return;
		}
	}

	const newBlocks = aiDraftPlan.proposed.map((p) => {
		const dayDate = dateFromDayKey(p.dayKey);
		return {
			id: uuid("block"),
			taskId: p.taskId,
			label: "",
			startAtIso: minutesToIso(dayDate, p.startMin),
			endAtIso: minutesToIso(dayDate, p.endMin),
			note,
		};
	});

	state.timeBlocks = [...newBlocks, ...(state.timeBlocks || [])];
	aiLastAppliedBlockIds = newBlocks.map((b) => b.id);
	saveState(state);
	renderCalendar();

	const modal = globalThis.bootstrap?.Modal?.getOrCreateInstance?.(elements.aiPlan.modal);
	modal?.hide();

	const totalMin = aiDraftPlan.proposed.reduce((sum, p) => sum + (p.endMin - p.startMin), 0);
	showAlert({
		variant: "alert-success",
		html: `<strong>AI plan applied.</strong> Added ${newBlocks.length} block${newBlocks.length === 1 ? "" : "s"} (${totalMin} min).`,
	});
}

function undoLastAiApply() {
	if (!aiLastAppliedBlockIds.length) return;
	const ids = new Set(aiLastAppliedBlockIds);
	state.timeBlocks = (state.timeBlocks || []).filter((b) => !ids.has(b.id));
	aiLastAppliedBlockIds = [];
	saveState(state);
	renderCalendar();
	clearAiPlanPreview();
	if (elements.aiPlan.undoButton) elements.aiPlan.undoButton.disabled = true;
	showAlert({ variant: "alert-success", html: "<strong>Undone.</strong> Removed last AI plan blocks." });
}

function heatLevelFromMinutes(focusMin) {
	const m = Number(focusMin) || 0;
	if (m <= 0) return 0;
	if (m < 15) return 1;
	if (m < 30) return 2;
	if (m < 60) return 3;
	return 4;
}

function renderHeatmap(container, stats, { range, nowMs }) {
	if (!container) return;
	container.innerHTML = "";

	const daysInRange = rangeDaysToShow(range);
	const end = startOfLocalDay(new Date(nowMs));
	const startRange = addLocalDays(end, -(daysInRange - 1));

	const alignedStart = addLocalDays(startRange, -startRange.getDay());
	const alignedEnd = addLocalDays(end, 6 - end.getDay());

	if (elements.stats.heatmapHint) {
		const fromKey = toLocalDayKey(startRange);
		const toKey = toLocalDayKey(end);
		elements.stats.heatmapHint.textContent = fromKey === toKey ? fromKey : `${fromKey} → ${toKey}`;
	}

	for (let date = new Date(alignedStart); date <= alignedEnd; date = addLocalDays(date, 1)) {
		const dayKey = toLocalDayKey(date);

		const inRange = date >= startRange && date <= end;
		const focusSec = stats.byDayFocusSec?.[dayKey] || 0;
		const focusMin = Math.round(focusSec / 60);
		const level = inRange ? heatLevelFromMinutes(focusMin) : 0;

		const cell = document.createElement("div");
		cell.className = `heatmap-cell heat-${level}${inRange ? "" : " heat-out"}`;
		cell.title = `${dayKey}: ${focusMin} min focus`;
		cell.setAttribute("aria-label", `${dayKey}: ${focusMin} minutes focus`);
		container.appendChild(cell);
	}
}

function renderTaskStats(tbody, emptyEl, stats) {
	if (!tbody) return;
	tbody.innerHTML = "";

	const taskTitleById = new Map(state.tasks.map((t) => [t.id, t.title]));
	const entries = Object.keys(stats.byTaskFocusSec || {})
		.map((taskId) => ({
			taskId,
			focusSec: Number(stats.byTaskFocusSec[taskId] || 0),
			sessions: Number(stats.byTaskFocusSessions?.[taskId] || 0),
		}))
		.filter((e) => e.focusSec > 0)
		.sort((a, b) => b.focusSec - a.focusSec);

	if (entries.length === 0) {
		if (emptyEl) emptyEl.style.display = "block";
		return;
	}
	if (emptyEl) emptyEl.style.display = "none";

	for (const e of entries.slice(0, 10)) {
		const label =
			e.taskId === "__none__"
				? "Unassigned"
				: typeof taskTitleById.get(e.taskId) === "string"
					? taskTitleById.get(e.taskId)
					: "[Deleted task]";
		const min = Math.round(e.focusSec / 60);

		const tr = document.createElement("tr");
		const tdLabel = document.createElement("td");
		tdLabel.textContent = label;

		const tdMin = document.createElement("td");
		tdMin.className = "text-end";
		tdMin.textContent = String(min);

		const tdSessions = document.createElement("td");
		tdSessions.className = "text-end";
		tdSessions.textContent = String(Math.round(e.sessions));

		tr.append(tdLabel, tdMin, tdSessions);
		tbody.appendChild(tr);
	}
}

function renderSummaryCard() {
	const summary = elements.summary;
	if (!summary?.focusMinutes || !summary?.focusSessions || !summary?.activeTask) return;

	const todayLogs = filterLogsByRange("today");
	const stats = computeStats(todayLogs, { nowMs: Date.now() });

	const focusMin = Math.round((stats.focusSec || 0) / 60);
	const sessions = stats.focusSessions || 0;

	summary.focusMinutes.textContent = `${focusMin} min`;
	summary.focusSessions.textContent = String(sessions);
	summary.activeTask.textContent = getActiveTaskTitle() || "None";

	if (summary.text) {
		summary.text.textContent = `You've focused ${focusMin} min across ${sessions} session${sessions === 1 ? "" : "s"} today.`;
	}
}

function calendarDayLabel(date) {
	return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(date);
}

function calendarRangeLabel(days) {
	if (!days.length) return "";
	if (days.length === 1) {
		return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" }).format(days[0]);
	}
	const start = days[0];
	const end = days[days.length - 1];
	const sameMonth = start.getMonth() === end.getMonth();
	const startFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(start);
	const endFmt = new Intl.DateTimeFormat(undefined, { month: sameMonth ? "short" : "short", day: "numeric", year: "numeric" }).format(end);
	return `${startFmt} - ${endFmt}`;
}

function getCalendarDays() {
	const settings = getCalendarSettings();
	const view = calendarView === "day" ? "day" : "week";
	const cursor = startOfLocalDay(calendarCursorDate);
	if (view === "day") return [cursor];
	const start = startOfWeek(cursor, settings.weekStart);
	return Array.from({ length: 7 }, (_, i) => addLocalDays(start, i));
}

function renderCalendarHeader(days) {
	if (!elements.calendar.headerLabel) return;
	elements.calendar.headerLabel.textContent = calendarRangeLabel(days);
}

function renderCalendar() {
	const grid = elements.calendar.grid;
	if (!grid) return;

	const settings = getCalendarSettings();
	const dayStartMin = settings.dayStartHour * 60;
	const dayEndMin = settings.dayEndHour * 60;
	const slotMinutes = settings.slotMinutes;
	const slots = Math.ceil((dayEndMin - dayStartMin) / slotMinutes);
	syncCalendarHourInputs(settings);

	const days = getCalendarDays();
	grid.style.setProperty("--slot-height", `${CALENDAR_SLOT_HEIGHT}px`);
	grid.style.setProperty("--day-count", String(days.length));
	grid.style.setProperty("--slots", String(slots));

	grid.innerHTML = "";

	const headerRow = document.createElement("div");
	headerRow.className = "calendar-header-row";
	const corner = document.createElement("div");
	corner.className = "calendar-corner";
	const dayHeaders = document.createElement("div");
	dayHeaders.className = "calendar-day-headers";

	const todayKey = toLocalDayKey(new Date());
	for (const day of days) {
		const key = toLocalDayKey(day);
		const header = document.createElement("div");
		header.className = "calendar-day-header";
		if (key === todayKey) header.classList.add("today");
		header.textContent = calendarDayLabel(day);
		dayHeaders.appendChild(header);
	}

	headerRow.append(corner, dayHeaders);
	grid.appendChild(headerRow);

	const body = document.createElement("div");
	body.className = "calendar-body";

	const timeAxis = document.createElement("div");
	timeAxis.className = "calendar-time-axis";
	for (let m = dayStartMin; m <= dayEndMin; m += 60) {
		const label = document.createElement("div");
		label.className = "calendar-time-label";
		label.style.top = `${((m - dayStartMin) / slotMinutes) * CALENDAR_SLOT_HEIGHT}px`;
		label.textContent = formatTimeLabel(m);
		timeAxis.appendChild(label);
	}

	const columns = document.createElement("div");
	columns.className = "calendar-day-columns";
	for (const day of days) {
		const col = document.createElement("div");
		col.className = "calendar-day-column";
		col.dataset.dayKey = toLocalDayKey(day);
		col.dataset.dayIso = day.toISOString();
		columns.appendChild(col);
	}

	body.append(timeAxis, columns);
	grid.appendChild(body);

	renderTimeBlocks(days, { dayStartMin, dayEndMin, slotMinutes });
	renderCalendarHeader(days);
	calendarNowLineContext = { days, dayStartMin, dayEndMin, slotMinutes };
	renderNowLine(calendarNowLineContext);
	ensureNowLineTimer();

	bindCalendarEvents();
}

function renderTimeBlocks(days, { dayStartMin, dayEndMin, slotMinutes }) {
	const grid = elements.calendar.grid;
	if (!grid) return;
	const columns = grid.querySelector(".calendar-day-columns");
	if (!columns) return;

	const dayKeys = new Set(days.map((d) => toLocalDayKey(d)));
	const blocks = state.timeBlocks || [];

	for (const block of blocks) {
		const m = blockMinutes(block);
		if (!dayKeys.has(m.dayKey)) continue;
		if (m.endMin <= dayStartMin || m.startMin >= dayEndMin) continue;

		const col = columns.querySelector(`[data-day-key="${m.dayKey}"]`);
		if (!col) continue;

		const clippedStart = Math.max(m.startMin, dayStartMin);
		const clippedEnd = Math.min(m.endMin, dayEndMin);
		const top = ((clippedStart - dayStartMin) / slotMinutes) * CALENDAR_SLOT_HEIGHT;
		const height = ((clippedEnd - clippedStart) / slotMinutes) * CALENDAR_SLOT_HEIGHT;
		if (height <= 0) continue;

		const el = document.createElement("div");
		el.className = "timeblock";
		el.dataset.blockId = block.id;
		el.style.top = `${top}px`;
		el.style.height = `${height}px`;

		const title = document.createElement("div");
		title.className = "timeblock-title";
		const task = block.taskId ? state.tasks.find((t) => t.id === block.taskId) : null;
		if (task) {
			title.textContent = task.title;
		} else {
			el.classList.add("timeblock-event");
			title.textContent = block.label || "Untitled event";
		}

		const meta = document.createElement("div");
		meta.className = "timeblock-meta";
		meta.textContent = `${formatTimeLabel(m.startMin)}-${formatTimeLabel(m.endMin)}`;

		const editBtn = document.createElement("button");
		editBtn.type = "button";
		editBtn.className = "timeblock-edit";
		editBtn.dataset.action = "edit-block";
		editBtn.innerHTML = '<i class="fas fa-pen"></i>';

		const handleStart = document.createElement("div");
		handleStart.className = "timeblock-handle start";
		handleStart.dataset.action = "resize-start";

		const handleEnd = document.createElement("div");
		handleEnd.className = "timeblock-handle end";
		handleEnd.dataset.action = "resize-end";

		el.append(handleStart, handleEnd, title, meta, editBtn);
		col.appendChild(el);
	}
}

function renderNowLine(context) {
	const grid = elements.calendar.grid;
	if (!grid || !context) return;
	const columns = grid.querySelector(".calendar-day-columns");
	if (!columns) return;

	columns.querySelectorAll(".calendar-now-line").forEach((el) => el.remove());

	const { days, dayStartMin, dayEndMin, slotMinutes } = context;
	const todayKey = toLocalDayKey(new Date());
	const todayInView = days.some((d) => toLocalDayKey(d) === todayKey);
	if (!todayInView) return;

	const now = new Date();
	const nowMin = now.getHours() * 60 + now.getMinutes();
	if (nowMin < dayStartMin || nowMin > dayEndMin) return;

	const col = columns.querySelector(`[data-day-key="${todayKey}"]`);
	if (!col) return;

	const top = ((nowMin - dayStartMin) / slotMinutes) * CALENDAR_SLOT_HEIGHT;
	const line = document.createElement("div");
	line.className = "calendar-now-line";
	line.style.top = `${top}px`;
	const dot = document.createElement("span");
	dot.className = "calendar-now-dot";
	line.appendChild(dot);
	col.appendChild(line);
}

function ensureNowLineTimer() {
	if (calendarNowLineTimerId !== null) return;
	calendarNowLineTimerId = window.setInterval(() => {
		if (!calendarNowLineContext) return;
		renderNowLine(calendarNowLineContext);
	}, 60 * 1000);
}

let calendarEventsBound = false;
let calendarDragState = null;
let calendarIgnoreClickUntil = 0;

function bindCalendarEvents() {
	if (calendarEventsBound || !elements.calendar.grid) return;
	calendarEventsBound = true;

	elements.calendar.grid.addEventListener("pointerdown", onCalendarPointerDown);
	elements.calendar.grid.addEventListener("click", onCalendarClick);
}

function onCalendarClick(e) {
	if (Date.now() < calendarIgnoreClickUntil) return;
	const edit = e.target.closest('[data-action="edit-block"]');
	if (edit) {
		const blockEl = edit.closest(".timeblock");
		if (blockEl?.dataset.blockId) openTimeblockModal(blockEl.dataset.blockId);
		return;
	}

	const blockEl = e.target.closest(".timeblock");
	if (blockEl?.dataset.blockId) {
		const block = state.timeBlocks.find((b) => b.id === blockEl.dataset.blockId);
		if (block?.taskId) {
			state.runtime.activeTaskId = block.taskId;
			saveState(state);
			renderTasks();
			renderTimer();
		}
	}
}

function onCalendarPointerDown(e) {
	const grid = elements.calendar.grid;
	if (!grid) return;

	const handle = e.target.closest(".timeblock-handle");
	const blockEl = e.target.closest(".timeblock");
	const column = e.target.closest(".calendar-day-column");

	if (handle && blockEl) {
		e.preventDefault();
		startResizeBlock(e, blockEl, handle.dataset.action === "resize-start" ? "start" : "end");
		return;
	}
	if (blockEl) {
		if (e.target.closest('[data-action="edit-block"]')) return;
		e.preventDefault();
		startMoveBlock(e, blockEl);
		return;
	}
	if (column) {
		e.preventDefault();
		startCreateBlock(e, column);
		return;
	}
}

function minutesFromY(y, dayStartMin, slotMinutes, snap) {
	const raw = y / CALENDAR_SLOT_HEIGHT;
	let snapped = Math.round(raw);
	if (snap === "floor") snapped = Math.floor(raw);
	if (snap === "ceil") snapped = Math.ceil(raw);
	return dayStartMin + snapped * slotMinutes;
}

function startCreateBlock(e, column) {
	const settings = getCalendarSettings();
	const dayStartMin = settings.dayStartHour * 60;
	const dayEndMin = settings.dayEndHour * 60;
	const slotMinutes = settings.slotMinutes;

	const rect = column.getBoundingClientRect();
	const startY = e.clientY - rect.top;
	const startMin = clampMinutes(minutesFromY(startY, dayStartMin, slotMinutes, "floor"), dayStartMin, dayEndMin - slotMinutes);

	const ghost = document.createElement("div");
	ghost.className = "timeblock ghost";
	column.appendChild(ghost);

	calendarDragState = {
		type: "create",
		column,
		dayKey: column.dataset.dayKey,
		anchorMin: startMin,
		startMin,
		endMin: startMin + slotMinutes,
		dayStartMin,
		dayEndMin,
		slotMinutes,
		startY,
		ghost,
	};

	updateGhostBlock(calendarDragState);

	window.addEventListener("pointermove", onCalendarPointerMove);
	window.addEventListener("pointerup", onCalendarPointerUp, { once: true });
}

function startMoveBlock(e, blockEl) {
	const settings = getCalendarSettings();
	const dayStartMin = settings.dayStartHour * 60;
	const dayEndMin = settings.dayEndHour * 60;
	const slotMinutes = settings.slotMinutes;

	const blockId = blockEl.dataset.blockId;
	const block = state.timeBlocks.find((b) => b.id === blockId);
	if (!block) return;

	const m = blockMinutes(block);
	const column = blockEl.closest(".calendar-day-column");
	if (!column) return;

	const rect = column.getBoundingClientRect();
	const startY = e.clientY - rect.top;

	calendarDragState = {
		type: "move",
		blockId,
		column,
		dayKey: m.dayKey,
		startMin: m.startMin,
		endMin: m.endMin,
		dayStartMin,
		dayEndMin,
		slotMinutes,
		startY,
		el: blockEl,
	};

	window.addEventListener("pointermove", onCalendarPointerMove);
	window.addEventListener("pointerup", onCalendarPointerUp, { once: true });
}

function startResizeBlock(e, blockEl, edge) {
	const settings = getCalendarSettings();
	const dayStartMin = settings.dayStartHour * 60;
	const dayEndMin = settings.dayEndHour * 60;
	const slotMinutes = settings.slotMinutes;

	const blockId = blockEl.dataset.blockId;
	const block = state.timeBlocks.find((b) => b.id === blockId);
	if (!block) return;

	const m = blockMinutes(block);
	const column = blockEl.closest(".calendar-day-column");
	if (!column) return;

	const rect = column.getBoundingClientRect();
	const startY = e.clientY - rect.top;

	calendarDragState = {
		type: edge === "start" ? "resize-start" : "resize-end",
		blockId,
		column,
		dayKey: m.dayKey,
		startMin: m.startMin,
		endMin: m.endMin,
		dayStartMin,
		dayEndMin,
		slotMinutes,
		startY,
		el: blockEl,
	};

	window.addEventListener("pointermove", onCalendarPointerMove);
	window.addEventListener("pointerup", onCalendarPointerUp, { once: true });
}

function onCalendarPointerMove(e) {
	const stateDrag = calendarDragState;
	if (!stateDrag) return;
	const { dayStartMin, dayEndMin, slotMinutes, startY } = stateDrag;
	const rect = stateDrag.column.getBoundingClientRect();
	const currentY = e.clientY - rect.top;
	const deltaSlots = Math.round((currentY - startY) / CALENDAR_SLOT_HEIGHT);
	const deltaMin = deltaSlots * slotMinutes;

	let startMin = stateDrag.startMin;
	let endMin = stateDrag.endMin;

	if (stateDrag.type === "create") {
		const rawMin = clampMinutes(minutesFromY(currentY, dayStartMin, slotMinutes, "round"), dayStartMin, dayEndMin);
		startMin = Math.min(stateDrag.anchorMin, rawMin);
		endMin = Math.max(stateDrag.anchorMin, rawMin);
		if (endMin - startMin < slotMinutes) endMin = startMin + slotMinutes;
		endMin = clampMinutes(endMin, dayStartMin + slotMinutes, dayEndMin);
		stateDrag.startMin = startMin;
		stateDrag.endMin = endMin;
		updateGhostBlock(stateDrag);
		return;
	}

	if (stateDrag.type === "move") {
		const duration = stateDrag.endMin - stateDrag.startMin;
		startMin = clampMinutes(stateDrag.startMin + deltaMin, dayStartMin, dayEndMin - duration);
		endMin = startMin + duration;
		stateDrag.nextStartMin = startMin;
		stateDrag.nextEndMin = endMin;
		updateDragBlock(stateDrag);
		return;
	}

	if (stateDrag.type === "resize-start") {
		startMin = clampMinutes(stateDrag.startMin + deltaMin, dayStartMin, stateDrag.endMin - slotMinutes);
		stateDrag.nextStartMin = startMin;
		updateDragBlock(stateDrag);
		return;
	}

	if (stateDrag.type === "resize-end") {
		endMin = clampMinutes(stateDrag.endMin + deltaMin, stateDrag.startMin + slotMinutes, dayEndMin);
		stateDrag.nextEndMin = endMin;
		updateDragBlock(stateDrag);
	}
}

function updateGhostBlock(stateDrag) {
	const { ghost, dayStartMin, slotMinutes, startMin, endMin } = stateDrag;
	if (!ghost) return;
	const top = ((startMin - dayStartMin) / slotMinutes) * CALENDAR_SLOT_HEIGHT;
	const height = ((endMin - startMin) / slotMinutes) * CALENDAR_SLOT_HEIGHT;
	ghost.style.top = `${top}px`;
	ghost.style.height = `${height}px`;
}

function updateDragBlock(stateDrag) {
	const el = stateDrag.el;
	if (!el) return;
	const startMin = stateDrag.nextStartMin ?? stateDrag.startMin;
	const endMin = stateDrag.nextEndMin ?? stateDrag.endMin;
	const top = ((startMin - stateDrag.dayStartMin) / stateDrag.slotMinutes) * CALENDAR_SLOT_HEIGHT;
	const height = ((endMin - startMin) / stateDrag.slotMinutes) * CALENDAR_SLOT_HEIGHT;
	el.style.top = `${top}px`;
	el.style.height = `${height}px`;
	const hasOverlap = overlapsBlock(stateDrag.dayKey, startMin, endMin, stateDrag.blockId);
	el.classList.toggle("invalid", hasOverlap);
}

function onCalendarPointerUp() {
	const stateDrag = calendarDragState;
	if (!stateDrag) return;
	calendarDragState = null;
	calendarIgnoreClickUntil = Date.now() + 200;

	window.removeEventListener("pointermove", onCalendarPointerMove);

	if (stateDrag.type === "create") {
		stateDrag.ghost?.remove();
		const startMin = stateDrag.startMin;
		const endMin = stateDrag.endMin;
		if (overlapsBlock(stateDrag.dayKey, startMin, endMin, null)) {
			showAlert({ variant: "alert-danger", html: "<strong>Overlap not allowed.</strong> Adjust the time range." });
			renderCalendar();
			return;
		}
		const dayDate = dateFromDayKey(stateDrag.dayKey);
		const newBlock = {
			id: uuid("block"),
			taskId: state.runtime.activeTaskId || null,
			label: "",
			startAtIso: minutesToIso(dayDate, startMin),
			endAtIso: minutesToIso(dayDate, endMin),
			note: "",
		};
		state.timeBlocks = [newBlock, ...(state.timeBlocks || [])];
		saveState(state);
		renderCalendar();
		openTimeblockModal(newBlock.id);
		return;
	}

	const blockId = stateDrag.blockId;
	if (!blockId) return;
	const startMin = stateDrag.nextStartMin ?? stateDrag.startMin;
	const endMin = stateDrag.nextEndMin ?? stateDrag.endMin;
	if (overlapsBlock(stateDrag.dayKey, startMin, endMin, blockId)) {
		showAlert({ variant: "alert-danger", html: "<strong>Overlap not allowed.</strong> Adjust the time range." });
		renderCalendar();
		return;
	}
	const block = state.timeBlocks.find((b) => b.id === blockId);
	if (!block) {
		renderCalendar();
		return;
	}
	const dayDate = dateFromDayKey(stateDrag.dayKey);
	block.startAtIso = minutesToIso(dayDate, startMin);
	block.endAtIso = minutesToIso(dayDate, endMin);
	saveState(state);
	renderCalendar();
}

function openTimeblockModal(blockId) {
	const block = state.timeBlocks.find((b) => b.id === blockId);
	if (!block || !elements.timeblock.modal) return;

	calendarEditingBlockId = blockId;
	const select = elements.timeblock.taskSelect;
	if (select) {
		select.innerHTML = "";
		const optNone = new Option("Unassigned", "");
		select.appendChild(optNone);
		for (const task of state.tasks) {
			const opt = new Option(task.title, task.id);
			select.appendChild(opt);
		}
		select.value = block.taskId || "";
	}

	const m = blockMinutes(block);
	if (elements.timeblock.start) elements.timeblock.start.value = timeInputFromMinutes(m.startMin);
	if (elements.timeblock.end) elements.timeblock.end.value = timeInputFromMinutes(m.endMin);
	if (elements.timeblock.label) elements.timeblock.label.value = block.label || "";
	if (elements.timeblock.note) elements.timeblock.note.value = block.note || "";

	const modal = globalThis.bootstrap?.Modal?.getOrCreateInstance?.(elements.timeblock.modal);
	modal?.show();
}

function closeTimeblockModal() {
	if (!elements.timeblock.modal) return;
	const modal = globalThis.bootstrap?.Modal?.getOrCreateInstance?.(elements.timeblock.modal);
	modal?.hide();
	calendarEditingBlockId = null;
}
function renderStats() {
	if (!elements.stats.panel) return;

	const filtered = filterLogsByRange(statsRange);
	const stats = computeStats(filtered, { nowMs: Date.now() });
	const charts = buildChartsData(stats);

	elements.stats.focusTime.textContent = formatMinutes(stats.focusSec);
	elements.stats.focusSessions.textContent = String(stats.focusSessions);
	elements.stats.breakTime.textContent = formatMinutes(stats.breakSec);
	elements.stats.totalTime.textContent = formatMinutes(stats.totalSec);
	elements.stats.hint.textContent = `Showing ${filtered.length} sessions`;

	renderBarChart(elements.stats.bar, charts.bar);
	renderDonutChart(elements.stats.donut, charts.donut);
	renderHeatmap(elements.stats.heatmap, stats, { range: statsRange, nowMs: Date.now() });
	renderTaskStats(elements.stats.tasksBody, elements.stats.tasksEmpty, stats);

	for (const btn of elements.stats.panel.querySelectorAll("[data-stats-range]")) {
		btn.classList.toggle("active", btn.getAttribute("data-stats-range") === statsRange);
	}
}

function renderBarChart(container, { labels, valuesMin }) {
	container.innerHTML = "";
	const width = 640;
	const height = 160;
	const pad = 24;

	const maxVal = Math.max(1, ...valuesMin);
	const barCount = Math.max(1, valuesMin.length);
	const barW = (width - pad * 2) / barCount;

	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

	valuesMin.forEach((v, i) => {
		const h = Math.round(((height - pad * 2) * v) / maxVal);
		const x = pad + i * barW + Math.round(barW * 0.15);
		const y = height - pad - h;
		const w = Math.max(2, Math.round(barW * 0.7));

		const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		rect.setAttribute("x", String(x));
		rect.setAttribute("y", String(y));
		rect.setAttribute("width", String(w));
		rect.setAttribute("height", String(h));
		rect.setAttribute("rx", "4");
		rect.setAttribute("fill", modeColors.focus);
		svg.appendChild(rect);
	});

	if (labels.length === 0) {
		const text = document.createElement("div");
		text.className = "small text-muted mt-2";
		text.textContent = "No focus data yet.";
		container.appendChild(text);
		return;
	}

	container.appendChild(svg);
}

function renderDonutChart(container, { focusSec, breakSec }) {
	container.innerHTML = "";
	const total = Math.max(1, focusSec + breakSec);
	const focusPct = focusSec / total;
	const trackColor = getComputedStyle(document.documentElement).getPropertyValue("--progress-track").trim() || "#ddd";

	const size = 140;
	const stroke = 14;
	const r = (size - stroke) / 2;
	const c = 2 * Math.PI * r;

	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("viewBox", `0 0 ${size} ${size}`);

	const bg = document.createElementNS("http://www.w3.org/2000/svg", "circle");
	bg.setAttribute("cx", String(size / 2));
	bg.setAttribute("cy", String(size / 2));
	bg.setAttribute("r", String(r));
	bg.setAttribute("fill", "none");
	bg.setAttribute("stroke", trackColor);
	bg.setAttribute("stroke-width", String(stroke));
	svg.appendChild(bg);

	const fg = document.createElementNS("http://www.w3.org/2000/svg", "circle");
	fg.setAttribute("cx", String(size / 2));
	fg.setAttribute("cy", String(size / 2));
	fg.setAttribute("r", String(r));
	fg.setAttribute("fill", "none");
	fg.setAttribute("stroke", modeColors.focus);
	fg.setAttribute("stroke-width", String(stroke));
	fg.setAttribute("stroke-dasharray", `${Math.round(c * focusPct)} ${Math.round(c * (1 - focusPct))}`);
	fg.setAttribute("stroke-dashoffset", String(Math.round(c * 0.25)));
	fg.setAttribute("stroke-linecap", "round");
	svg.appendChild(fg);

	container.appendChild(svg);

	const label = document.createElement("div");
	label.className = "small text-muted mt-2";
	label.textContent = `${Math.round(focusPct * 100)}% focus`;
	container.appendChild(label);
}

function renderAll() {
	applyThemeSetting();
	renderSettings();
	timerEngine.hydrateFromState(state.runtime, { getModeDurationSec });
	soundController.applySettings(state.settings);
	renderTimer(state.runtime.remainingSec);
	renderTasks();
	renderLogs();
	renderSummaryCard();
}

function setMode(mode) {
	state.runtime.mode = mode;
	state.runtime.timerState = "idle";
	state.runtime.endAtMs = null;
	state.runtime.cycleCountSinceLongBreak = 0;
	timerEngine.setMode(mode);
	soundController.syncRunning(false);
	resetRoundWarningState();
	saveState(state);
	renderAll();
}

elements.nav.focus.addEventListener("click", (e) => {
	e.preventDefault();
	setMode("focus");
});
elements.nav.shortBreak.addEventListener("click", (e) => {
	e.preventDefault();
	setMode("shortBreak");
});
elements.nav.longBreak.addEventListener("click", (e) => {
	e.preventDefault();
	setMode("longBreak");
});

elements.timer.start.addEventListener("click", () => {
	timerEngine.start();
	saveStateImmediate(state);
});

elements.timer.pause.addEventListener("click", () => {
	timerEngine.pause();
	saveStateImmediate(state);
});

elements.timer.reset.addEventListener("click", () => {
	timerEngine.reset();
	soundController.syncRunning(false);
	resetRoundWarningState();
	saveStateImmediate(state);
});

elements.timer.skip.addEventListener("click", () => {
	timerEngine.skip();
	resetRoundWarningState();
});

elements.alert.dismiss?.addEventListener("click", dismissAlert);

elements.todo.add.addEventListener("click", () => {
	const title = elements.todo.input.value.trim();
	if (!title) return;
	const order = state.tasks.length ? Math.max(...state.tasks.map((t) => t.order)) + 1 : 0;
	const rawEstimate = elements.todo.estimateInput?.value;
	const parsedEstimate = Number(rawEstimate);
	const estimateMin = Number.isFinite(parsedEstimate) ? Math.max(0, Math.min(9999, parsedEstimate)) : null;
	state.tasks.push({
		id: uuid("task"),
		title,
		done: false,
		createdAtIso: new Date().toISOString(),
		order,
		estimateMin,
	});
	elements.todo.input.value = "";
	if (elements.todo.estimateInput) elements.todo.estimateInput.value = "";
	saveState(state);
	renderTasks();
});

elements.todo.input.addEventListener("keydown", (e) => {
	if (e.key === "Enter") {
		e.preventDefault();
		elements.todo.add.click();
	}
});

elements.todo.estimateInput?.addEventListener("keydown", (e) => {
	if (e.key === "Enter") {
		e.preventDefault();
		elements.todo.add.click();
	}
});

elements.todo.clear.addEventListener("click", () => {
	if (!confirm("Clear all tasks? Tip: use Settings → Export data (JSON) to back up first.")) return;
	state.tasks = [];
	state.runtime.activeTaskId = null;
	for (const block of state.timeBlocks || []) {
		if (block) block.taskId = null;
	}
	saveState(state);
	renderTasks();
	renderTimer();
});

elements.todo.list.addEventListener("click", (e) => {
	const li = e.target.closest("li[data-task-id]");
	if (!li) return;
	const taskId = li.dataset.taskId;
	const task = state.tasks.find((t) => t.id === taskId);
	if (!task) return;

	const actionEl = e.target.closest("[data-action]");
	const action = actionEl?.dataset?.action;

	if (action === "toggle-done") {
		task.done = !task.done;
		saveState(state);
		renderTasks();
		return;
	}

	if (action === "delete-task") {
		state.tasks = state.tasks.filter((t) => t.id !== taskId);
		if (state.runtime.activeTaskId === taskId) state.runtime.activeTaskId = null;
		for (const block of state.timeBlocks || []) {
			if (block?.taskId === taskId) block.taskId = null;
		}
		saveState(state);
		renderTasks();
		renderTimer();
		return;
	}

	if (action === "select-task") {
		state.runtime.activeTaskId = state.runtime.activeTaskId === taskId ? null : taskId;
		saveState(state);
		renderTasks();
		renderTimer();
		return;
	}
});

elements.log.clear.addEventListener("click", () => {
	if (!confirm("Clear all log sessions? Tip: use Settings → Export data (JSON) to back up first.")) return;
	state.logs = [];
	saveState(state);
	renderLogs();
});

elements.log.tableBody.addEventListener("click", (e) => {
	const tr = e.target.closest("tr[data-log-id]");
	if (!tr) return;
	const logId = tr.dataset.logId;

	const actionEl = e.target.closest("[data-action]");
	if (!actionEl) return;

	if (actionEl.dataset.action === "delete-log") {
		state.logs = state.logs.filter((l) => l.id !== logId);
		saveState(state);
		renderLogs();
	}
});

elements.log.tableBody.addEventListener("input", (e) => {
	const input = e.target.closest('input[data-action="edit-note"]');
	if (!input) return;
	const tr = e.target.closest("tr[data-log-id]");
	if (!tr) return;
	const log = state.logs.find((l) => l.id === tr.dataset.logId);
	if (!log) return;
	log.note = input.value;
	saveState(state);
});

elements.settings.longBreakInterval.addEventListener("input", () => {
	state.settings.longBreakInterval = Number(elements.settings.longBreakInterval.value);
	elements.settings.longBreakIntervalValue.textContent = String(state.settings.longBreakInterval);
	saveState(state);
	renderTimer();
});

elements.settings.autoStart.addEventListener("change", () => {
	state.settings.autoStartRounds = elements.settings.autoStart.checked;
	saveState(state);
});

elements.settings.tickEnabled.addEventListener("change", () => {
	state.settings.sounds.tickEnabled = elements.settings.tickEnabled.checked;
	saveState(state);
});

elements.settings.endingNotificationMin.addEventListener("change", () => {
	state.settings.sounds.endingNotificationMin = Number(elements.settings.endingNotificationMin.value);
	saveState(state);
});

elements.settings.notificationsEnabled?.addEventListener("change", async () => {
	if (!isDesktopNotifSupported()) {
		state.settings.notifications.enabled = false;
		if (elements.settings.notificationsEnabled) elements.settings.notificationsEnabled.checked = false;
		saveState(state);
		updateDesktopNotificationsUi();
		return;
	}

	const wantsEnabled = Boolean(elements.settings.notificationsEnabled?.checked);
	if (!wantsEnabled) {
		state.settings.notifications.enabled = false;
		saveState(state);
		updateDesktopNotificationsUi();
		return;
	}

	if (Notification.permission === "granted") {
		state.settings.notifications.enabled = true;
		saveState(state);
		updateDesktopNotificationsUi();
		return;
	}

	const perm = await requestDesktopNotifPermission();
	if (perm === "granted") {
		state.settings.notifications.enabled = true;
		saveState(state);
		updateDesktopNotificationsUi();
		return;
	}

	state.settings.notifications.enabled = false;
	if (elements.settings.notificationsEnabled) elements.settings.notificationsEnabled.checked = false;
	saveState(state);
	updateDesktopNotificationsUi();
	showAlert({ variant: "alert-danger", html: "<strong>Desktop notifications not enabled.</strong> Permission was not granted." });
});

elements.settings.background.addEventListener("change", () => {
	state.settings.sounds.background = elements.settings.background.value;
	soundController.applySettings(state.settings);
	saveState(state);
});

function clamp01(n, fallback) {
	const v = Number(n);
	if (!Number.isFinite(v)) return fallback;
	return Math.max(0, Math.min(1, v));
}

function wireVolumeControl({ inputEl, valueEl, setCurrent, fallbackPct }) {
	if (!inputEl) return;
	inputEl.addEventListener("input", () => {
		const pct = Math.max(0, Math.min(100, Number(inputEl.value)));
		const vol = clamp01(pct / 100, (fallbackPct || 0) / 100);
		setCurrent(vol);
		if (valueEl) valueEl.textContent = `${Math.round(vol * 100)}%`;
		soundController.applySettings(state.settings);
		saveState(state);
	});
}

wireVolumeControl({
	inputEl: elements.settings.tickVolume,
	valueEl: elements.settings.tickVolumeValue,
	setCurrent: (v) => (state.settings.sounds.volumes.tick = v),
	fallbackPct: 100,
});
wireVolumeControl({
	inputEl: elements.settings.alertsVolume,
	valueEl: elements.settings.alertsVolumeValue,
	setCurrent: (v) => (state.settings.sounds.volumes.alerts = v),
	fallbackPct: 100,
});
wireVolumeControl({
	inputEl: elements.settings.bgmVolume,
	valueEl: elements.settings.bgmVolumeValue,
	setCurrent: (v) => (state.settings.sounds.volumes.bgm = v),
	fallbackPct: 10,
});

elements.settings.theme.addEventListener("change", () => {
	state.settings.theme = elements.settings.theme.value;
	applyThemeSetting();
	saveState(state);
});

function updateDurationFromInputs() {
	const focus = Math.max(1, Number(elements.settings.focusMin.value || 25));
	const shortBreak = Math.max(1, Number(elements.settings.shortMin.value || 5));
	const longBreak = Math.max(1, Number(elements.settings.longMin.value || 20));
	state.settings.durationsMin = { focus, shortBreak, longBreak };

	if (state.runtime.timerState !== "running") {
		state.runtime.remainingSec = getModeDurationSec(state.runtime.mode);
		timerEngine.hydrateFromState(state.runtime, { getModeDurationSec });
		renderTimer();
	}
}

elements.settings.focusMin.addEventListener("change", () => {
	updateDurationFromInputs();
	saveState(state);
});
elements.settings.shortMin.addEventListener("change", () => {
	updateDurationFromInputs();
	saveState(state);
});
elements.settings.longMin.addEventListener("change", () => {
	updateDurationFromInputs();
	saveState(state);
});

elements.settings.exportData.addEventListener("click", () => {
	const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = "pomodorotimers-data.json";
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
});

elements.settings.importData.addEventListener("change", async () => {
	const file = elements.settings.importData.files?.[0];
	if (!file) return;
	try {
		const text = await file.text();
		const parsed = JSON.parse(text);
		const normalized = normalizeImportedState(parsed);
		if (!normalized) {
			alert("Invalid file: expected pomodorotimers v2 JSON.");
			return;
		}
		if (!confirm("Importing will replace your current data. Continue?")) return;
		state = normalized;
		saveStateImmediate(state);
		resetRoundWarningState();
		renderAll();
	} catch {
		alert("Failed to import data.");
	}
});

elements.stats.panel?.addEventListener("click", (e) => {
	const btn = e.target.closest("[data-stats-range]");
	if (!btn) return;
	statsRange = btn.getAttribute("data-stats-range");
	renderStats();
});

function moveScrollIndicator() {
	if (!elements.scroll.indicator) return;
	const maxHeight = window.document.body.scrollHeight - window.innerHeight;
	if (maxHeight <= 0) return;
	const percentage = (window.scrollY / maxHeight) * 100;
	elements.scroll.indicator.style.width = `${percentage}%`;
}

function displayScrollButton() {
	if (!elements.scroll.backToTopWrap) return;
	const maxHeight = window.document.body.scrollHeight - window.innerHeight;
	if (window.scrollY >= maxHeight - 1300) {
		elements.scroll.backToTopWrap.style.display = "block";
	} else {
		elements.scroll.backToTopWrap.style.display = "none";
	}
}

window.addEventListener("scroll", () => {
	moveScrollIndicator();
	displayScrollButton();
});

elements.scroll.backToTop?.addEventListener("click", () => {
	window.scroll({ top: 0, left: 0, behavior: "smooth" });
});

elements.timer.clearActiveTaskButton?.addEventListener("click", () => {
	state.runtime.activeTaskId = null;
	saveState(state);
	renderTasks();
	renderTimer();
});

function isEditableEventTarget(target) {
	if (!target || typeof target !== "object") return false;
	const el = /** @type {HTMLElement} */ (target);
	if (typeof el.closest !== "function") return false;
	return Boolean(el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]'));
}

function isInteractiveEventTarget(target) {
	if (!target || typeof target !== "object") return false;
	const el = /** @type {HTMLElement} */ (target);
	if (typeof el.closest !== "function") return false;
	return Boolean(el.closest('button, a, [role="button"], [role="link"]'));
}

function openModalById(id) {
	const el = document.getElementById(id);
	if (!el) return;
	try {
		const Modal = globalThis.bootstrap?.Modal;
		if (Modal && typeof Modal.getOrCreateInstance === "function") {
			Modal.getOrCreateInstance(el).show();
			return;
		}
	} catch {
		// ignore
	}
	// Fallback: attempt click on any trigger
	el.scrollIntoView?.({ block: "center" });
}

function toggleStartPause() {
	if (state.runtime.timerState === "running") {
		timerEngine.pause();
		saveStateImmediate(state);
		return;
	}
	timerEngine.start();
	saveStateImmediate(state);
}

function resetTimerAction() {
	timerEngine.reset();
	soundController.syncRunning(false);
	resetRoundWarningState();
	saveStateImmediate(state);
}

function skipTimerAction() {
	timerEngine.skip();
	resetRoundWarningState();
}

document.addEventListener("keydown", (e) => {
	if (e.ctrlKey || e.metaKey || e.altKey) return;
	if (isEditableEventTarget(e.target)) return;
	if (document.querySelector(".modal.show")) return;

	if (e.key === " ") {
		if (isInteractiveEventTarget(e.target)) return;
		e.preventDefault();
		toggleStartPause();
		return;
	}

	const key = String(e.key || "").toLowerCase();
	if (key === "r") {
		e.preventDefault();
		resetTimerAction();
		return;
	}
	if (key === "s") {
		e.preventDefault();
		skipTimerAction();
		return;
	}
	if (key === "1") {
		e.preventDefault();
		setMode("focus");
		return;
	}
	if (key === "2") {
		e.preventDefault();
		setMode("shortBreak");
		return;
	}
	if (key === "3") {
		e.preventDefault();
		setMode("longBreak");
		return;
	}
	if (key === "t") {
		e.preventDefault();
		openModalById("toDoModal");
		return;
	}
	if (key === "l") {
		e.preventDefault();
		openModalById("loggingModal");
		return;
	}
	if (e.key === "," || e.key === "<") {
		e.preventDefault();
		openModalById("settingsModal");
		return;
	}
});

function setCalendarView(view) {
	calendarView = view === "day" ? "day" : "week";
	if (elements.calendar.viewWeek) elements.calendar.viewWeek.classList.toggle("active", calendarView === "week");
	if (elements.calendar.viewDay) elements.calendar.viewDay.classList.toggle("active", calendarView === "day");
	renderCalendar();
}

function handleCalendarHoursChange() {
	const settings = getCalendarSettings();
	const startHour = hourFromTimeInput(elements.calendar.startTime?.value, false);
	const endHour = hourFromTimeInput(elements.calendar.endTime?.value, true);

	if (startHour === null || endHour === null) {
		showAlert({ variant: "alert-danger", html: "<strong>Invalid time.</strong> Please check start and end." });
		syncCalendarHourInputs(settings);
		return;
	}
	if (endHour !== 24 && endHour <= startHour) {
		showAlert({ variant: "alert-danger", html: "<strong>End time must be after start.</strong>" });
		syncCalendarHourInputs(settings);
		return;
	}

	state.settings.calendar.dayStartHour = Math.max(0, Math.min(23, startHour));
	state.settings.calendar.dayEndHour = Math.max(1, Math.min(24, endHour));
	if (state.settings.calendar.dayEndHour <= state.settings.calendar.dayStartHour) {
		state.settings.calendar.dayEndHour = Math.min(24, state.settings.calendar.dayStartHour + 1);
	}
	saveState(state);
	renderCalendar();
}

elements.calendar.viewWeek?.addEventListener("click", () => setCalendarView("week"));
elements.calendar.viewDay?.addEventListener("click", () => setCalendarView("day"));
elements.calendar.startTime?.addEventListener("change", handleCalendarHoursChange);
elements.calendar.endTime?.addEventListener("change", handleCalendarHoursChange);

elements.calendar.prev?.addEventListener("click", () => {
	const delta = calendarView === "week" ? -7 : -1;
	calendarCursorDate = addLocalDays(calendarCursorDate, delta);
	renderCalendar();
});

elements.calendar.next?.addEventListener("click", () => {
	const delta = calendarView === "week" ? 7 : 1;
	calendarCursorDate = addLocalDays(calendarCursorDate, delta);
	renderCalendar();
});

elements.calendar.today?.addEventListener("click", () => {
	calendarCursorDate = new Date();
	renderCalendar();
});

function normalizeAiMaxBlockMin(raw, slotMinutes) {
	const parsed = Number.parseInt(String(raw), 10);
	if (Number.isNaN(parsed)) return null;
	const slot = Math.max(1, slotMinutes);
	let ai = Math.max(slot, Math.min(240, parsed));
	ai = Math.round(ai / slot) * slot;
	ai = Math.max(slot, Math.min(240, ai));
	return ai;
}

elements.calendar.aiPlanButton?.addEventListener("click", () => {
	renderAiPlanModal();
	const modal = globalThis.bootstrap?.Modal?.getOrCreateInstance?.(elements.aiPlan.modal);
	modal?.show();
});

elements.aiPlan.maxBlockInput?.addEventListener("change", () => {
	const settings = getCalendarSettings();
	const slotMinutes = settings.slotMinutes;
	const next = normalizeAiMaxBlockMin(elements.aiPlan.maxBlockInput.value, slotMinutes);
	if (next === null) {
		elements.aiPlan.maxBlockInput.value = String(state.settings?.calendar?.aiMaxBlockMin || 90);
		showAlert({ variant: "alert-danger", html: "<strong>Invalid number.</strong> Please enter a valid max block length." });
		return;
	}
	state.settings.calendar.aiMaxBlockMin = next;
	elements.aiPlan.maxBlockInput.value = String(next);
	saveState(state);
	clearAiPlanPreview();
});

elements.aiPlan.previewButton?.addEventListener("click", generateAiDraftPlan);
elements.aiPlan.applyButton?.addEventListener("click", applyAiDraftPlan);
elements.aiPlan.undoButton?.addEventListener("click", undoLastAiApply);

elements.timeblock.save?.addEventListener("click", () => {
	const blockId = calendarEditingBlockId;
	if (!blockId) return;
	const block = state.timeBlocks.find((b) => b.id === blockId);
	if (!block) return;

	const settings = getCalendarSettings();
	const dayStartMin = settings.dayStartHour * 60;
	const dayEndMin = settings.dayEndHour * 60;

	const m = blockMinutes(block);
	const dayDate = dateFromDayKey(m.dayKey);

	let startMin = minutesFromTimeInput(elements.timeblock.start?.value, false);
	let endMin = minutesFromTimeInput(elements.timeblock.end?.value, true);
	if (startMin === null || endMin === null) {
		showAlert({ variant: "alert-danger", html: "<strong>Invalid time.</strong> Please check start and end." });
		return;
	}
	startMin = clampMinutes(startMin, dayStartMin, dayEndMin - settings.slotMinutes);
	endMin = clampMinutes(endMin, dayStartMin + settings.slotMinutes, dayEndMin);
	if (endMin <= startMin) {
		showAlert({ variant: "alert-danger", html: "<strong>End time must be after start.</strong>" });
		return;
	}
	if (overlapsBlock(m.dayKey, startMin, endMin, blockId)) {
		showAlert({ variant: "alert-danger", html: "<strong>Overlap not allowed.</strong> Adjust the time range." });
		return;
	}

	block.label = elements.timeblock.label?.value.trim() || "";
	block.taskId = elements.timeblock.taskSelect?.value || null;
	block.note = elements.timeblock.note?.value || "";
	block.startAtIso = minutesToIso(dayDate, startMin);
	block.endAtIso = minutesToIso(dayDate, endMin);
	saveState(state);
	closeTimeblockModal();
	renderCalendar();
});

elements.timeblock.del?.addEventListener("click", () => {
	const blockId = calendarEditingBlockId;
	if (!blockId) return;
	state.timeBlocks = (state.timeBlocks || []).filter((b) => b.id !== blockId);
	saveState(state);
	closeTimeblockModal();
	renderCalendar();
});

renderAll();
