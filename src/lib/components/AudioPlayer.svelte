<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		src: string;
		title: string;
		filename: string;
	}

	let { src, title, filename }: Props = $props();

	let audioEl: HTMLAudioElement | null = $state(null);

	// Playback state
	let isPlaying = $state(false);
	let isTransposing = $state(false);
	let transposeError = $state<string | null>(null);
	let progress = $state(0);
	let duration = $state(0);

	// Pitch / volume controls
	let pitch = $state(0); // semitones (-12 to +12)
	let volume = $state(100); // percentage

	// Per-semitone URL cache so we never re-process the same shift
	let transposedCache = $state<Record<number, string>>({});
	// Which pitch is currently loaded into the audio element
	let loadedPitch = $state(0);

	const pitchLabel = $derived(
		pitch === 0 ? 'Original' : `${pitch > 0 ? '+' : ''}${pitch} semitones`
	);
	const progressPercent = $derived(duration > 0 ? (progress / duration) * 100 : 0);

	onMount(() => {
		// Set initial src imperatively so Svelte never overwrites it reactively
		if (audioEl) {
			audioEl.src = src;
			audioEl.load();
		}
	});

	async function handlePlay() {
		if (!audioEl) return;
		transposeError = null;

		// Pause if already playing
		if (isPlaying) {
			audioEl.pause();
			isPlaying = false;
			return;
		}

		// Resolve the URL we need to play
		let targetUrl: string;

		if (pitch === 0) {
			targetUrl = src;
		} else if (transposedCache[pitch]) {
			targetUrl = transposedCache[pitch];
		} else {
			// Ask the server to transpose (rubberband + formant preservation)
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

		// Swap source only when the pitch has changed
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
		// Stop playback — user will need to press play again at the new pitch
		if (isPlaying && audioEl) {
			audioEl.pause();
			isPlaying = false;
		}
		pitch = newPitch;
		transposeError = null;
	}

	function handleVolumeChange(e: Event) {
		volume = parseInt((e.target as HTMLInputElement).value);
		if (audioEl) audioEl.volume = volume / 100;
	}

	function handleSeek(e: Event) {
		const newPercent = parseFloat((e.target as HTMLInputElement).value);
		const newPosition = (newPercent / 100) * duration;
		progress = newPosition;
		if (audioEl) audioEl.currentTime = newPosition;
	}

	function formatTime(seconds: number): string {
		if (!seconds || !isFinite(seconds) || isNaN(seconds)) return '0:00';
		return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
	}
</script>

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

<div class="rounded-xl bg-white/5 p-4">
	<h3 class="mb-3 truncate font-medium text-white" {title}>
		{title}
	</h3>

	<!-- Play/Pause and Progress -->
	<div class="mb-4 flex items-center gap-4">
		<button
			onclick={handlePlay}
			disabled={isTransposing}
			class="flex h-12 w-12 flex-shrink-0 cursor-pointer items-center justify-center rounded-full bg-purple-600 text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
		>
			{#if isTransposing}
				<svg class="h-5 w-5 animate-spin" viewBox="0 0 24 24">
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
				<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
					<rect x="6" y="4" width="4" height="16" />
					<rect x="14" y="4" width="4" height="16" />
				</svg>
			{:else}
				<svg class="ml-1 h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
					<path d="M8 5v14l11-7z" />
				</svg>
			{/if}
		</button>

		<div class="flex-1">
			{#if isTransposing}
				<div class="text-sm text-purple-300">
					Transposing with rubberband… this may take a few seconds
				</div>
			{:else}
				<div class="text-sm text-purple-300">
					{formatTime(progress)} / {formatTime(duration)}
				</div>
				<input
					type="range"
					min="0"
					max="100"
					step="0.1"
					value={progressPercent}
					oninput={handleSeek}
					class="mt-1 h-2 w-full cursor-pointer appearance-none rounded-lg bg-white/20 accent-purple-500"
				/>
			{/if}
		</div>
	</div>

	<!-- Transpose error -->
	{#if transposeError}
		<div class="mb-3 rounded-lg bg-red-500/20 p-2 text-sm text-red-300">
			⚠️ {transposeError}
		</div>
	{/if}

	<!-- Pitch Control -->
	<div class="mb-3">
		<div class="mb-1 flex items-center justify-between">
			<label class="text-sm font-medium text-purple-200">Pitch</label>
			<span class="text-sm text-purple-400">{pitchLabel}</span>
		</div>
		<input
			type="range"
			min="-12"
			max="12"
			step="1"
			value={pitch}
			oninput={handlePitchChange}
			class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-white/20 accent-purple-500"
		/>
		<div class="mt-1 flex justify-between text-xs text-purple-400/70">
			<span>-12</span>
			<span>0</span>
			<span>+12</span>
		</div>
	</div>

	<!-- Volume Control -->
	<div>
		<div class="mb-1 flex items-center justify-between">
			<label class="text-sm font-medium text-purple-200">Volume</label>
			<span class="text-sm text-purple-400">{volume}%</span>
		</div>
		<input
			type="range"
			min="0"
			max="100"
			step="1"
			value={volume}
			oninput={handleVolumeChange}
			class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-white/20 accent-purple-500"
		/>
	</div>
</div>
