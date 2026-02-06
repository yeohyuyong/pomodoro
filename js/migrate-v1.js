import { createDefaultState, MIGRATED_KEY, saveStateImmediate, STORAGE_KEY } from "./storage.js";

function hasAnyV1Data() {
	const keys = [
		"currentPomodoroValue",
		"currentShortBreakValue",
		"currentLongBreakValue",
		"tickSoundInputValue",
		"notificationTextInputValue",
		"backgroundMusicOptionsValue",
		"longBreakInterval",
		"autoStartRoundsInputValue",
		"darkModeToggleValue",
		"logContents",
		"todoContents",
	];
	return keys.some((k) => localStorage.getItem(k) !== null);
}

function parseV1Boolean(raw, fallback = false) {
	if (raw === "true") return true;
	if (raw === "false") return false;
	return fallback;
}

function parseV1Int(raw, fallback, min, max) {
	const n = Number.parseInt(String(raw), 10);
	if (Number.isNaN(n)) return fallback;
	return Math.max(min, Math.min(max, n));
}

function safeParseHtmlFragment(html, wrapperTag = "div") {
	try {
		const parser = new DOMParser();
		const doc = parser.parseFromString(`<${wrapperTag}>${html || ""}</${wrapperTag}>`, "text/html");
		return doc.body.firstElementChild;
	} catch {
		return null;
	}
}

function stripText(el) {
	return (el?.textContent || "").replace(/\s+/g, " ").trim();
}

function monthIndexFromShortName(mon) {
	const m = String(mon).slice(0, 3).toLowerCase();
	const map = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
	return map[m];
}

function parseV1Date(dateText) {
	// Example: "6 Feb 2026"
	const parts = stripText({ textContent: dateText }).split(" ");
	if (parts.length < 3) return null;
	const day = Number.parseInt(parts[0], 10);
	const monthIdx = monthIndexFromShortName(parts[1]);
	const year = Number.parseInt(parts[2], 10);
	if (!Number.isFinite(day) || !Number.isFinite(year) || monthIdx === undefined) return null;
	return { day, monthIdx, year };
}

function parseV1Time(timeText) {
	// Example: "3:05 PM"
	const t = stripText({ textContent: timeText });
	const match = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
	if (!match) return null;
	let hours = Number.parseInt(match[1], 10);
	const minutes = Number.parseInt(match[2], 10);
	const ampm = match[3].toUpperCase();
	if (hours === 12) hours = 0;
	if (ampm === "PM") hours += 12;
	return { hours, minutes };
}

function dateTimeToIso({ day, monthIdx, year }, { hours, minutes }) {
	const dt = new Date(year, monthIdx, day, hours, minutes, 0, 0);
	return dt.toISOString();
}

function migrateTodoV1(html, nowIso) {
	const root = safeParseHtmlFragment(html, "ul");
	if (!root) return [];

	const items = [...root.querySelectorAll("li")];
	return items
		.map((li, idx) => {
			const clone = li.cloneNode(true);
			for (const btn of clone.querySelectorAll("button, i")) btn.remove();
			const title = stripText(clone);
			if (!title) return null;
			return {
				id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `task_${Date.now()}_${Math.random().toString(16).slice(2)}`,
				title,
				done: li.classList.contains("done"),
				createdAtIso: nowIso,
				order: idx,
			};
		})
		.filter(Boolean);
}

function modeFromV1SessionText(text) {
	const t = stripText({ textContent: text }).toLowerCase();
	if (t.includes("short")) return "shortBreak";
	if (t.includes("long")) return "longBreak";
	return "focus";
}

function migrateLogsV1(html) {
	const root = safeParseHtmlFragment(html, "tbody");
	if (!root) return [];

	const rows = [...root.querySelectorAll("tr")];
	return rows
		.map((tr) => {
			const cells = tr.querySelectorAll("th, td");
			if (cells.length < 5) return null;

			const sessionText = stripText(cells[0]);
			const dateText = stripText(cells[1]);
			const startText = stripText(cells[2]);
			const endText = stripText(cells[3]);
			const durationText = stripText(cells[4]);

			const noteInput = tr.querySelector("input");
			const note = typeof noteInput?.value === "string" ? noteInput.value.trim() : "";

			const type = modeFromV1SessionText(sessionText);
			const plannedMin = parseV1Int(durationText.replace(/[^\d]/g, ""), 0, 0, 999);
			const plannedDurationSec = plannedMin * 60;

			const date = parseV1Date(dateText);
			const start = parseV1Time(startText);
			const end = parseV1Time(endText);
			if (!date || !start || !end) {
				const nowIso = new Date().toISOString();
				return {
					id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `log_${Date.now()}_${Math.random().toString(16).slice(2)}`,
					type,
					startedAtIso: nowIso,
					endedAtIso: nowIso,
					plannedDurationSec,
					actualDurationSec: plannedDurationSec,
					taskId: null,
					note: `[migrated] ${sessionText} ${dateText} ${startText}-${endText} ${durationText}${note ? ` | ${note}` : ""}`,
				};
			}

			let startedAtIso = dateTimeToIso(date, start);
			let endedAtIso = dateTimeToIso(date, end);
			const startedMs = Date.parse(startedAtIso);
			let endedMs = Date.parse(endedAtIso);
			if (Number.isFinite(startedMs) && Number.isFinite(endedMs) && endedMs < startedMs) {
				endedMs += 24 * 60 * 60 * 1000;
				endedAtIso = new Date(endedMs).toISOString();
			}

			return {
				id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `log_${Date.now()}_${Math.random().toString(16).slice(2)}`,
				type,
				startedAtIso,
				endedAtIso,
				plannedDurationSec,
				actualDurationSec: plannedDurationSec,
				taskId: null,
				note,
			};
		})
		.filter(Boolean);
}

export function migrateV1ToV2IfNeeded() {
	if (localStorage.getItem(STORAGE_KEY)) return;
	if (!hasAnyV1Data()) return;

	const nowIso = new Date().toISOString();
	const state = createDefaultState();

	const focusMin = parseV1Int(localStorage.getItem("currentPomodoroValue"), 25, 1, 999);
	const shortMin = parseV1Int(localStorage.getItem("currentShortBreakValue"), 5, 1, 999);
	const longMin = parseV1Int(localStorage.getItem("currentLongBreakValue"), 20, 1, 999);
	state.settings.durationsMin = { focus: focusMin, shortBreak: shortMin, longBreak: longMin };
	state.runtime.remainingSec = focusMin * 60;

	state.settings.longBreakInterval = parseV1Int(localStorage.getItem("longBreakInterval"), 4, 1, 12);
	state.settings.autoStartRounds = parseV1Boolean(localStorage.getItem("autoStartRoundsInputValue"), false);

	state.settings.sounds.tickEnabled = parseV1Boolean(localStorage.getItem("tickSoundInputValue"), false);
	state.settings.sounds.endingNotificationMin = parseV1Int(localStorage.getItem("notificationTextInputValue"), 1, 0, 120);
	state.settings.sounds.background = localStorage.getItem("backgroundMusicOptionsValue") || "None";

	const v1Dark = localStorage.getItem("darkModeToggleValue");
	if (v1Dark === "true") state.settings.theme = "dark";
	if (v1Dark === "false") state.settings.theme = "light";

	state.tasks = migrateTodoV1(localStorage.getItem("todoContents"), nowIso);
	state.logs = migrateLogsV1(localStorage.getItem("logContents"));

	saveStateImmediate(state);
	try {
		localStorage.setItem(MIGRATED_KEY, "true");
	} catch {
		// ignore
	}
}
