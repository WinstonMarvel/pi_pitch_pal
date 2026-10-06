<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import AudioPlayerRow from '$lib/components/AudioPlayerRow.svelte';
	import { getTheme, toggleTheme } from '$lib/theme.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let isLoading = $state(false);
	let videoUrl = $state('');

	// Track which file is being renamed
	let renamingFile = $state<string | null>(null);
	let newTitle = $state('');

	// Reactive audio files from server data
	let audioFiles = $derived(data.audioFiles);

	// Shared volume control for every track (see AudioPlayerRow)
	let masterVolume = $state(100);

	// Manually-entered "scale" label per file, persisted on the server (build/client/audio/.scales.json)
	let scales = $state<Record<string, string>>(data.scales);
	const scaleSaveTimers: Record<string, ReturnType<typeof setTimeout>> = {};

	function updateScale(filename: string, value: string) {
		scales = { ...scales, [filename]: value };

		// Debounce writes so we don't hit the server on every keystroke
		clearTimeout(scaleSaveTimers[filename]);
		scaleSaveTimers[filename] = setTimeout(() => {
			fetch('/api/scale', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ filename, scale: value })
			}).catch(() => {
				// best-effort; the input still reflects the user's typed value
			});
		}, 500);
	}

	// Sorting by name or scale, ascending/descending
	let sortKey = $state<'name' | 'scale'>('name');
	let sortDir = $state<'asc' | 'desc'>('asc');

	function toggleSort(key: 'name' | 'scale') {
		if (sortKey === key) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			sortDir = 'asc';
		}
	}

	let sortedAudioFiles = $derived(
		[...audioFiles].sort((a, b) => {
			const left = sortKey === 'name' ? a.title : (scales[a.filename] ?? '');
			const right = sortKey === 'name' ? b.title : (scales[b.filename] ?? '');
			const cmp = left.localeCompare(right, undefined, { sensitivity: 'base' });
			return sortDir === 'asc' ? cmp : -cmp;
		})
	);

	function startRename(filename: string, currentTitle: string) {
		renamingFile = filename;
		newTitle = currentTitle;
	}

	function cancelRename() {
		renamingFile = null;
		newTitle = '';
	}
</script>

<svelte:head>
	<title>Pi Pitch Pal - Audio Extractor</title>
</svelte:head>

<main
	class="min-h-screen bg-gradient-to-br from-[var(--grad-from)] via-[var(--grad-via)] to-[var(--grad-to)]"
>
	<div class="container mx-auto px-4 py-12">
		<!-- Header -->
		<header class="relative mb-12 text-center">
			<button
				onclick={toggleTheme}
				title="Switch theme"
				class="absolute top-0 right-0 cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
			>
				{getTheme() === 'vibrant' ? '🎨 Vibrant' : '⚪ Neutral'}
			</button>
			<h1 class="mb-2 text-4xl font-bold text-[var(--text-primary)]">🎵 Pi Pitch Pal</h1>
			<p class="text-lg text-[var(--text-secondary)]">Extract audio from any video</p>
		</header>

		<!-- Download Form -->
		<section class="mx-auto mb-12 max-w-2xl">
			<div class="rounded-2xl bg-[var(--surface)] p-8 shadow-2xl backdrop-blur-lg">
				<h2 class="mb-6 text-xl font-semibold text-[var(--text-primary)]">Download Audio</h2>

				<form
					method="POST"
					action="?/download"
					use:enhance={() => {
						isLoading = true;
						return async ({ update }) => {
							await update();
							isLoading = false;
							videoUrl = '';
						};
					}}
					class="space-y-4"
				>
					<div>
						<label for="url" class="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
							Video URL
						</label>
						<input
							type="url"
							id="url"
							name="url"
							bind:value={videoUrl}
							placeholder="Paste video link here..."
							required
							disabled={isLoading}
							class="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-muted)] transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/50 focus:outline-none disabled:opacity-50"
						/>
					</div>

					<button
						type="submit"
						disabled={isLoading || !videoUrl}
						class="w-full cursor-pointer rounded-lg bg-[var(--accent)] px-6 py-3 font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#if isLoading}
							<span class="flex items-center justify-center gap-2">
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
								Downloading...
							</span>
						{:else}
							🎬 Extract Audio
						{/if}
					</button>
				</form>

				<!-- Status Messages -->
				{#if form?.error}
					<div class="mt-4 rounded-lg bg-red-500/20 p-4 text-red-200">
						❌ {form.error}
					</div>
				{/if}

				{#if form?.success}
					<div class="mt-4 rounded-lg bg-green-500/20 p-4 text-green-200">
						✅ {form.message}
					</div>
				{/if}
			</div>
		</section>

		<!-- Audio Library -->
		<section class="mx-auto max-w-6xl">
			<div class="rounded-2xl bg-[var(--surface)] p-8 shadow-2xl backdrop-blur-lg">
				<div class="mb-6 flex flex-wrap items-center justify-between gap-4">
					<h2 class="text-xl font-semibold text-[var(--text-primary)]">🎧 Audio Library</h2>

					<!-- Universal volume control — applies to every track -->
					<div class="flex items-center gap-3">
						<span class="text-sm font-medium whitespace-nowrap text-[var(--text-secondary)]"
							>🔊 Volume</span
						>
						<input
							type="range"
							min="0"
							max="100"
							step="1"
							bind:value={masterVolume}
							class="h-1.5 w-32 cursor-pointer appearance-none rounded-lg bg-white/20 accent-[var(--accent)]"
						/>
						<span class="w-10 text-sm text-[var(--text-secondary)]">{masterVolume}%</span>
					</div>
				</div>

				{#if audioFiles.length === 0}
					<div class="py-12 text-center text-[var(--text-muted)]">
						<p class="text-lg">No audio files yet</p>
						<p class="text-sm">Download your first audio above!</p>
					</div>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full border-separate border-spacing-y-1 text-sm">
							<thead>
								<tr class="text-left text-xs tracking-wide text-[var(--text-secondary)] uppercase">
									<th class="w-12 px-3 py-2"></th>
									<th class="px-3 py-2">
										<button
											onclick={() => toggleSort('name')}
											class="cursor-pointer hover:text-[var(--text-primary)]"
										>
											Name {#if sortKey === 'name'}{sortDir === 'asc' ? '↑' : '↓'}{/if}
										</button>
									</th>
									<th class="px-3 py-2">Duration</th>
									<th class="px-3 py-2">Pitch</th>
									<th class="px-3 py-2">
										<button
											onclick={() => toggleSort('scale')}
											class="cursor-pointer hover:text-[var(--text-primary)]"
										>
											Scale {#if sortKey === 'scale'}{sortDir === 'asc' ? '↑' : '↓'}{/if}
										</button>
									</th>
									<th class="px-3 py-2 text-right">Actions</th>
								</tr>
							</thead>
							<tbody>
								{#each sortedAudioFiles as audio (audio.filename)}
									<tr
										class="rounded-lg bg-[var(--surface-soft)] align-top hover:bg-[var(--surface)]"
									>
										<AudioPlayerRow
											src={audio.url}
											title={audio.title}
											filename={audio.filename}
											bind:volume={masterVolume}
										/>

										<td class="px-3 py-3">
											<input
												type="text"
												placeholder="e.g. C major"
												value={scales[audio.filename] ?? ''}
												oninput={(e) =>
													updateScale(audio.filename, (e.target as HTMLInputElement).value)}
												class="w-28 rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-2 py-1 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/50 focus:outline-none"
											/>
										</td>

										<td class="px-3 py-3 text-right">
											{#if renamingFile === audio.filename}
												<form
													method="POST"
													action="?/rename"
													class="flex justify-end gap-2"
													use:enhance={() => {
														return async ({ update }) => {
															await update();
															cancelRename();
														};
													}}
												>
													<input type="hidden" name="filename" value={audio.filename} />
													<input
														type="text"
														name="newTitle"
														bind:value={newTitle}
														placeholder="New title"
														required
														class="w-32 rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-2 py-1 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/50 focus:outline-none"
													/>
													<button
														type="submit"
														class="cursor-pointer rounded-lg bg-green-600/50 px-2 py-1 text-sm font-medium text-white transition hover:bg-green-600"
													>
														✓
													</button>
													<button
														type="button"
														onclick={cancelRename}
														class="cursor-pointer rounded-lg bg-gray-600/50 px-2 py-1 text-sm font-medium text-white transition hover:bg-gray-600"
													>
														✕
													</button>
												</form>
											{:else}
												<div class="flex justify-end gap-1">
													<button
														onclick={() => startRename(audio.filename, audio.title)}
														title="Rename"
														class="cursor-pointer rounded-lg p-2 text-[var(--text-secondary)] transition hover:bg-[var(--surface)] hover:text-[var(--text-primary)]"
													>
														✏️
													</button>
													<a
														href={audio.url}
														download={audio.filename}
														title="Download"
														class="rounded-lg p-2 text-[var(--text-secondary)] transition hover:bg-[var(--surface)] hover:text-[var(--text-primary)]"
													>
														⬇️
													</a>
													<form
														method="POST"
														action="?/delete"
														use:enhance={() => {
															return async ({ update }) => {
																await update();
															};
														}}
													>
														<input type="hidden" name="filename" value={audio.filename} />
														<button
															type="submit"
															title="Delete"
															class="cursor-pointer rounded-lg p-2 text-red-300 transition hover:bg-white/10 hover:text-red-200"
															onclick={(e) => {
																if (!confirm('Are you sure you want to delete this audio file?')) {
																	e.preventDefault();
																}
															}}
														>
															🗑️
														</button>
													</form>
												</div>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		</section>
	</div>
</main>
