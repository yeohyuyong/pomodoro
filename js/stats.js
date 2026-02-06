function toLocalDayKey(date) {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function safeDurationSec(log) {
	const actual = Number(log.actualDurationSec);
	if (Number.isFinite(actual) && actual >= 0) return actual;
	const planned = Number(log.plannedDurationSec);
	if (Number.isFinite(planned) && planned >= 0) return planned;

	const started = Date.parse(log.startedAtIso);
	const ended = Date.parse(log.endedAtIso);
	if (Number.isFinite(started) && Number.isFinite(ended) && ended >= started) return Math.round((ended - started) / 1000);
	return 0;
}

export function computeStats(logs, { nowMs }) {
	let focusSec = 0;
	let breakSec = 0;
	let focusSessions = 0;
	/** @type {Record<string, number>} */
	const byDayFocusSec = {};

	for (const log of logs) {
		if (!log || typeof log !== "object") continue;
		const type = log.type;
		const dur = safeDurationSec(log);
		const startedMs = Date.parse(log.startedAtIso);
		const startedDate = Number.isFinite(startedMs) ? new Date(startedMs) : new Date(nowMs);
		const dayKey = toLocalDayKey(startedDate);

		if (type === "focus") {
			focusSec += dur;
			focusSessions += 1;
			byDayFocusSec[dayKey] = (byDayFocusSec[dayKey] || 0) + dur;
		} else if (type === "shortBreak" || type === "longBreak") {
			breakSec += dur;
		}
	}

	return {
		focusSec,
		breakSec,
		totalSec: focusSec + breakSec,
		focusSessions,
		byDayFocusSec,
	};
}

export function buildChartsData(stats) {
	const dayKeys = Object.keys(stats.byDayFocusSec).sort();
	const barLabels = dayKeys;
	const barValuesMin = dayKeys.map((k) => Math.round((stats.byDayFocusSec[k] || 0) / 60));

	return {
		bar: { labels: barLabels, valuesMin: barValuesMin },
		donut: { focusSec: stats.focusSec, breakSec: stats.breakSec },
	};
}

