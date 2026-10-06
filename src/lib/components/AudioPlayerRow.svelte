<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		src: string;
		title: string;
		filename: string;
		volume: number; // universal volume (0-100), shared across all rows
	}

	let { src, title, filename, volume = $bindable(100) }: Props = $props();

	let audioEl: HTMLAudioElement | null = $state(null);

	let isPlaying = $state(false);
	let isTransposing = $state(false);
	let transposeError = $state<string | null>(null);
	let progress = $state(0);
	let duration = $state(0);

	let pitch = $state(0); // semitones (-12 to +12)

	// Per-semitone URL cache so we never re-process the same shift
	let transposedCache = $state<Record<number, string>>({});
	let loadedPitch = $state(0);

	const progressPercent = $derived(duration > 0 ? (progress / duration) * 100 : 0);

	onMount(() => {
		// Set initial src imperatively so Svelte never overwrites it reactively
		if (audioEl) {
			audioEl.src = src;
			audioEl.load();
		}
	});

	// Keep the live element in sync whenever the shared universal volume changes
	$effect(() => {
		if (audioEl) audioEl.volume = volume / 100;
	});

	async function handlePlay() {
		if (!audioEl) return;
		transposeError = null;

		if (isPlaying) {
			audioEl.pause();
			isPlaying = false;
			return;
		}

		let targetUrl: string;

		if (pitch === 0) {
			targetUrl = src;
		} else if (transposedCache[pitch]) {
			targetUrl = transposedCache[pitch];
		} else {
			isTransposing = true;
			try {
				const res = await fetch('/api/transpose', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ filename, semitones: pitch })
				});
				if (!res.ok) {
					const text = await res.text();
					throw new Error(text || `Server error ${res.status}`);
				}
				const data = (await res.json()) as { url: string };
				transposedCache = { ...transposedCache, [pitch]: data.url };
				targetUrl = data.url;
			} catch (err) {
				transposeError = err instanceof Error ? err.message : 'Transpose failed';
				isTransposing = false;
				return;
			}
			isTransposing = false;
		}

		if (loadedPitch !== pitch) {
			audioEl.src = targetUrl;
			audioEl.load();
			loadedPitch = pitch;
			progress = 0;
		}

		audioEl.volume = volume / 100;
		await audioEl.play();
		isPlaying = true;
	}

	function handlePitchChange(e: Event) {
		const newPitch = parseInt((e.target as HTMLInputElement).value);
		if (newPitch === pitch) return;
		if (isPlaying && audioEl) {
			audioEl.pause();
			isPlaying = false;
		}
		pitch = newPitch;
		transposeError = null;
	}

	function formatTime(seconds: number): string {
		if (!seconds || !isFinite(seconds) || isNaN(seconds)) return '0:00';
		return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
	}
</script>

<td class="px-3 py-3">
	<!-- Hidden audio element — src is managed imperatively in handlePlay / onMount -->
	<audio
		bind:this={audioEl}
		preload="metadata"
		ontimeupdate={() => {
			if (audioEl) progress = audioEl.currentTime;
		}}
		onloadedmetadata={() => {
			if (audioEl) duration = audioEl.duration;
		}}
		onended={() => {
			isPlaying = false;
			progress = 0;
			if (audioEl) audioEl.currentTime = 0;
		}}
	></audio>
	<button
		onclick={handlePlay}
		disabled={isTransposing}
		class="flex h-9 w-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--accent)] text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
	>
		{#if isTransposing}
			<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24">
				<circle
					class="opacity-25"
					cx="12"
					cy="12"
					r="10"
					stroke="currentColor"
					stroke-width="4"
					fill="none"
				></circle>
				<path
					class="opacity-75"
					fill="currentColor"
					d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
				></path>
			</svg>
		{:else if isPlaying}
			<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
				<rect x="6" y="4" width="4" height="16" />
				<rect x="14" y="4" width="4" height="16" />
			</svg>
		{:else}
			<svg class="ml-0.5 h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
				<path d="M8 5v14l11-7z" />
			</svg>
		{/if}
	</button>
</td>

<td class="min-w-0 px-3 py-3">
	<div class="truncate font-medium text-[var(--text-primary)]" {title}>{title}</div>
	{#if isTransposing}
		<div class="text-xs text-[var(--text-secondary)]">Transposing…</div>
	{:else}
		<input
			type="range"
			min="0"
			max="100"
			step="0.1"
			value={progressPercent}
			oninput={(e) => {
				const newPercent = parseFloat((e.target as HTMLInputElement).value);
				const newPosition = (newPercent / 100) * duration;
				progress = newPosition;
				if (audioEl) audioEl.currentTime = newPosition;
			}}
			class="mt-1 h-1 w-full max-w-xs cursor-pointer appearance-none rounded-lg bg-white/20 accent-[var(--accent)]"
		/>
	{/if}
	{#if transposeError}
		<div class="mt-1 text-xs text-red-300">⚠️ {transposeError}</div>
	{/if}
</td>

<td class="px-3 py-3 whitespace-nowrap text-[var(--text-secondary)]">
	{formatTime(progress)} / {formatTime(duration)}
</td>

<td class="px-3 py-3">
	<div class="flex items-center gap-2">
		<input
			type="range"
			min="-12"
			max="12"
			step="1"
			value={pitch}
			oninput={handlePitchChange}
			class="h-1.5 w-24 cursor-pointer appearance-none rounded-lg bg-white/20 accent-[var(--accent)]"
		/>
		<span class="w-10 flex-shrink-0 text-xs text-[var(--text-secondary)]"
			>{pitch === 0 ? 'Orig' : pitch > 0 ? `+${pitch}` : pitch}</span
		>
	</div>
</td>
