const STORAGE_KEY = 'pi-pitch-pal-theme';

export type Theme = 'vibrant' | 'neutral';

let theme = $state<Theme>('vibrant');

export function getTheme(): Theme {
	return theme;
}

export function applyTheme(next: Theme) {
	theme = next;
	if (typeof document !== 'undefined') {
		document.documentElement.setAttribute('data-theme', next);
	}
	if (typeof localStorage !== 'undefined') {
		try {
			localStorage.setItem(STORAGE_KEY, next);
		} catch {
			// ignore storage failures (e.g. private browsing)
		}
	}
}

export function initTheme() {
	let stored: Theme | null = null;
	try {
		stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
	} catch {
		// ignore storage failures (e.g. private browsing)
	}
	applyTheme(stored === 'neutral' || stored === 'vibrant' ? stored : 'vibrant');
}

export function toggleTheme() {
	applyTheme(theme === 'vibrant' ? 'neutral' : 'vibrant');
}
