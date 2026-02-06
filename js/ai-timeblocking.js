/**
 * @typedef {{ startMin: number, endMin: number }} Interval
 * @typedef {{ taskId: string, toPlanMin: number }} TaskToPlan
 * @typedef {{ dayKey: string, startMin: number, endMin: number, taskId: string }} ProposedBlock
 *
 * @typedef {{
 *   dayKeysInOrder: string[],
 *   freeIntervalsByDayKey: Record<string, Interval[]>,
 *   tasksToPlan: TaskToPlan[],
 *   slotMinutes: number,
 *   maxBlockMin: number
 * }} PlanInput
 *
 * @typedef {{
 *   proposed: ProposedBlock[],
 *   unscheduled: Array<{ taskId: string, remainingMin: number }>
 * }} PlanOutput
 */

function clampInt(value, min, max) {
	const n = Number.parseInt(String(value), 10);
	if (Number.isNaN(n)) return min;
	return Math.max(min, Math.min(max, n));
}

function floorToMultiple(value, multiple) {
	if (multiple <= 0) return value;
	return Math.floor(value / multiple) * multiple;
}

/**
 * Deterministic, UI-agnostic timeblocking planner.
 * - Consumes already-computed free intervals.
 * - Allocates tasks in order into earliest free time first.
 *
 * @param {PlanInput} input
 * @returns {PlanOutput}
 */
export function planTimeblocks(input) {
	const dayKeysInOrder = Array.isArray(input?.dayKeysInOrder) ? input.dayKeysInOrder : [];
	const freeIntervalsByDayKey = input?.freeIntervalsByDayKey && typeof input.freeIntervalsByDayKey === "object" ? input.freeIntervalsByDayKey : {};
	const tasksToPlan = Array.isArray(input?.tasksToPlan) ? input.tasksToPlan : [];
	const slotMinutes = clampInt(input?.slotMinutes, 1, 240);
	const maxBlockMin = Math.max(slotMinutes, clampInt(input?.maxBlockMin, slotMinutes, 24 * 60));

	const tasks = tasksToPlan
		.map((t) => ({
			taskId: String(t?.taskId || ""),
			remainingMin: clampInt(t?.toPlanMin, 0, 99999),
		}))
		.filter((t) => Boolean(t.taskId) && t.remainingMin > 0);

	/** @type {ProposedBlock[]} */
	const proposed = [];

	let taskIdx = 0;
	const nextSchedulableTask = () => {
		while (taskIdx < tasks.length && tasks[taskIdx].remainingMin < slotMinutes) taskIdx++;
		return taskIdx < tasks.length ? tasks[taskIdx] : null;
	};

	for (const dayKey of dayKeysInOrder) {
		const intervals = Array.isArray(freeIntervalsByDayKey[dayKey]) ? freeIntervalsByDayKey[dayKey] : [];
		for (const interval of intervals) {
			let cursor = clampInt(interval?.startMin, 0, 24 * 60);
			const intervalEnd = clampInt(interval?.endMin, 0, 24 * 60);
			while (cursor + slotMinutes <= intervalEnd) {
				const task = nextSchedulableTask();
				if (!task) break;

				const maxHere = Math.min(maxBlockMin, intervalEnd - cursor, task.remainingMin);
				const snapped = floorToMultiple(maxHere, slotMinutes);
				if (snapped < slotMinutes) break;

				proposed.push({ dayKey, startMin: cursor, endMin: cursor + snapped, taskId: task.taskId });
				cursor += snapped;
				task.remainingMin -= snapped;
			}
		}
	}

	const unscheduled = tasks
		.filter((t) => t.remainingMin > 0)
		.map((t) => ({ taskId: t.taskId, remainingMin: t.remainingMin }));

	return { proposed, unscheduled };
}

