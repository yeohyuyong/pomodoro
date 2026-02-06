function safeHowl(options) {
	if (typeof Howl !== "function") return null;
	try {
		return new Howl(options);
	} catch {
		return null;
	}
}

export function createSoundController(settings) {
	const alertSounds = {
		focus: safeHowl({ src: ["assets/sounds/alert-work.mp3"], volume: settings.sounds.volumes.alerts }),
		shortBreak: safeHowl({ src: ["assets/sounds/alert-short-break.mp3"], volume: settings.sounds.volumes.alerts }),
		longBreak: safeHowl({ src: ["assets/sounds/alert-long-break.mp3"], volume: settings.sounds.volumes.alerts }),
	};

	const tickSound = safeHowl({ src: ["assets/sounds/tick.mp3"], volume: settings.sounds.volumes.tick });
	const notificationSound = safeHowl({ src: ["assets/sounds/notification-bell.mp3"], volume: settings.sounds.volumes.alerts });

	const backgroundMusic = {
		Campfire: safeHowl({ src: ["assets/sounds/background_music/Campfire.mp3"], volume: settings.sounds.volumes.bgm, loop: true }),
		Forest: safeHowl({ src: ["assets/sounds/background_music/Forest.mp3"], volume: settings.sounds.volumes.bgm, loop: true }),
		Ocean: safeHowl({ src: ["assets/sounds/background_music/Ocean.mp3"], volume: settings.sounds.volumes.bgm, loop: true }),
		Rain: safeHowl({ src: ["assets/sounds/background_music/Rain.mp3"], volume: settings.sounds.volumes.bgm, loop: true }),
		"Windy Desert": safeHowl({ src: ["assets/sounds/background_music/Windy_Desert.mp3"], volume: settings.sounds.volumes.bgm, loop: true }),
	};

	let currentBackground = settings.sounds.background || "None";

	function stopAll() {
		for (const s of Object.values(backgroundMusic)) s?.stop?.();
	}

	function setBackground(name) {
		stopAll();
		currentBackground = name || "None";
	}

	function syncRunning(isRunning) {
		if (!isRunning) {
			stopAll();
			return;
		}
		if (currentBackground && currentBackground !== "None") {
			const howl = backgroundMusic[currentBackground];
			if (!howl) return;
			try {
				if (typeof howl.playing === "function" && howl.playing()) return;
			} catch {
				// ignore
			}
			howl.play?.();
		}
	}

	function applySettings(nextSettings) {
		const vols = nextSettings.sounds.volumes;
		for (const s of Object.values(alertSounds)) s?.volume?.(vols.alerts);
		tickSound?.volume?.(vols.tick);
		notificationSound?.volume?.(vols.alerts);
		for (const s of Object.values(backgroundMusic)) s?.volume?.(vols.bgm);
		setBackground(nextSettings.sounds.background);
	}

	function playAlert(mode) {
		alertSounds[mode]?.play?.();
	}

	let lastTickAt = 0;
	function playTick(enabled) {
		if (!enabled) return;
		const now = Date.now();
		if (now - lastTickAt < 800) return;
		lastTickAt = now;
		tickSound?.play?.();
	}

	function playNotification() {
		notificationSound?.play?.();
	}

	return { applySettings, playAlert, playTick, playNotification, setBackground, stopAll, syncRunning };
}
