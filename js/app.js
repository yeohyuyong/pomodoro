import { loadState, normalizeImportedState, saveState, saveStateImmediate } from "./storage.js";
import { migrateV1ToV2IfNeeded } from "./migrate-v1.js";
import { createTimerEngine } from "./timer-engine.js";
import { computeStats, buildChartsData } from "./stats.js";
import { createSoundController } from "./sounds.js";

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
		add: document.getElementById("addTaskButton"),
		clear: document.getElementById("clearTasksButton"),
		list: document.getElementById("listOfTasks"),
		emptyText: document.getElementById("NoTaskTodayText"),
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
	scroll: {
		indicator: document.getElementById("scrollIndicator"),
		backToTop: document.querySelector(".back-to-top-button"),
		backToTopWrap: document.querySelector(".scrolltop-wrap"),
	},
};

const modeColors = {
	focus: "#dc3545",
	shortBreak: "#28a745",
	longBreak: "#007bff",
};

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

		const del = document.createElement("button");
		del.type = "button";
		del.className = "btn btn-sm btn-outline-secondary";
		del.dataset.action = "delete-task";
		del.setAttribute("aria-label", "Delete task");
		del.innerHTML = '<i class="fas fa-trash-alt"></i>';

		li.append(toggle, title, del);
		elements.todo.list.appendChild(li);
	}
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
	state.tasks.push({ id: uuid("task"), title, done: false, createdAtIso: new Date().toISOString(), order });
	elements.todo.input.value = "";
	saveState(state);
	renderTasks();
});

elements.todo.input.addEventListener("keydown", (e) => {
	if (e.key === "Enter") {
		e.preventDefault();
		elements.todo.add.click();
	}
});

elements.todo.clear.addEventListener("click", () => {
	if (!confirm("Clear all tasks? Tip: use Settings → Export data (JSON) to back up first.")) return;
	state.tasks = [];
	state.runtime.activeTaskId = null;
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

renderAll();
