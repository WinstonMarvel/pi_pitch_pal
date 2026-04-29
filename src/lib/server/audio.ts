import { mkdir, unlink, rm, rename as fsRename, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import path from 'path';

const AUDIO_DIR = 'build/client/audio';
const TRANSPOSED_DIR = 'build/client/audio/transposed';

// Ensure audio directory exists
export async function ensureAudioDir() {
	if (!existsSync(AUDIO_DIR)) {
		await mkdir(AUDIO_DIR, { recursive: true });
	}
}

// Internal helper: run a shell command, resolve on exit code 0, reject otherwise
function runCommand(cmd: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = spawn(cmd, args);
		let errOutput = '';
		proc.stderr?.on('data', (d: Buffer) => (errOutput += d.toString()));
		proc.stdout?.on('data', () => {}); // drain stdout
		proc.on('close', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`${cmd} exited with code ${code}: ${errOutput.slice(0, 500)}`));
		});
		proc.on('error', reject);
	});
}

export interface TransposeResult {
	success: boolean;
	url?: string;
	error?: string;
}

export async function transposeAudio(filename: string, semitones: number): Promise<TransposeResult> {
	// Input validation
	if (!Number.isInteger(semitones) || semitones < -24 || semitones > 24 || semitones === 0) {
		return { success: false, error: 'semitones must be a non-zero integer between -24 and 24' };
	}
	// Strict filename validation to prevent path traversal
	if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
		return { success: false, error: 'Invalid filename' };
	}

	const inputPath = path.join(AUDIO_DIR, filename);
	if (!existsSync(inputPath)) {
		return { success: false, error: 'Source file not found' };
	}

	// Cache path: static/audio/transposed/<basename>/<p2|n3>.mp3
	const basename = filename.replace(/\.[^.]+$/, '');
	const semLabel = semitones > 0 ? `p${semitones}` : `n${Math.abs(semitones)}`;
	const cacheDir = path.join(TRANSPOSED_DIR, basename);
	const cachedFilename = `${semLabel}.mp3`;
	const cachedPath = path.join(cacheDir, cachedFilename);

	if (existsSync(cachedPath)) {
		return { success: true, url: `/audio/transposed/${basename}/${cachedFilename}` };
	}

	await mkdir(cacheDir, { recursive: true });

	const tempId = randomBytes(8).toString('hex');
	const tempIn = path.join(tmpdir(), `ppp_${tempId}_in.wav`);
	const tempOut = path.join(tmpdir(), `ppp_${tempId}_out.wav`);

	try {
		// 1. Decode MP3 → WAV (44.1 kHz stereo)
		await runCommand('ffmpeg', ['-y', '-i', inputPath, '-ar', '44100', '-ac', '2', tempIn]);

		// 2. Pitch-shift with rubberband (--formant preserves vocal character)
		await runCommand('rubberband', [
			'--pitch', semitones.toString(),
			'--formant',
			tempIn,
			tempOut
		]);

		// 3. Encode WAV → MP3
		await runCommand('ffmpeg', ['-y', '-i', tempOut, '-b:a', '192k', cachedPath]);

		return { success: true, url: `/audio/transposed/${basename}/${cachedFilename}` };
	} catch (err) {
		// Remove any partial output so a retry works cleanly
		if (existsSync(cachedPath)) {
			await unlink(cachedPath).catch(() => {});
		}
		return { success: false, error: err instanceof Error ? err.message : 'Processing failed' };
	} finally {
		await unlink(tempIn).catch(() => {});
		await unlink(tempOut).catch(() => {});
	}
}

export interface DownloadResult {
	success: boolean;
	filename?: string;
	title?: string;
	error?: string;
}

export async function downloadAudio(youtubeUrl: string): Promise<DownloadResult> {
	await ensureAudioDir();

	try {
		console.log('🎬 [Download] Starting download for:', youtubeUrl);

		// Use yt-dlp output template - single call, no separate info fetch
		const outputTemplate = path.join(AUDIO_DIR, '%(title).50s_%(id)s.%(ext)s');

		console.log('⬇️  [Download] Downloading and extracting audio...');

		// Use spawn to run yt-dlp directly - more reliable than the wrapper
		const { spawn } = await import('child_process');

		const result = await new Promise<{ filename: string; title: string }>((resolve, reject) => {
			const args = [
				youtubeUrl,
				'-x',
				'--audio-format', 'mp3',
				'--audio-quality', '256K',
				'-o', outputTemplate,
				'--no-playlist',
				'--print', 'after_move:filepath', // Print the final filename
				'--restrict-filenames' // Safe filenames
			];

			console.log('📋 [Download] Running: yt-dlp', args.join(' '));

			const proc = spawn('yt-dlp', args);
			let output = '';
			let errorOutput = '';

			proc.stdout.on('data', (data) => {
				const line = data.toString();
				output += line;
				console.log('📥 [yt-dlp]', line.trim());
			});

			proc.stderr.on('data', (data) => {
				const line = data.toString();
				errorOutput += line;
				console.log('⚠️  [yt-dlp]', line.trim());
			});

			proc.on('close', (code) => {
				if (code === 0) {
					const filepath = output.trim().split('\n').pop() || '';
					const filename = path.basename(filepath);
					const title = filename.replace(/_[^_]+\.mp3$/, '').replace(/_/g, ' ');
					resolve({ filename, title });
				} else {
					reject(new Error(errorOutput || `yt-dlp exited with code ${code}`));
				}
			});

			proc.on('error', (err) => {
				reject(err);
			});
		});

		console.log('✅ [Download] Complete:', result.filename);

		return {
			success: true,
			filename: result.filename,
			title: result.title
		};
	} catch (error) {
		console.error('❌ [Download] Error:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Failed to download audio'
		};
	}
}

export interface AudioFile {
	filename: string;
	title: string;
	url: string;
}

export async function getAudioFiles(): Promise<AudioFile[]> {
	await ensureAudioDir();

	const files = await readdir(AUDIO_DIR);

	return files
		.filter((file) => file.endsWith('.mp3'))
		.map((filename) => ({
			filename,
			title: filename.replace(/_[^_]+\.mp3$/, '').replace(/_/g, ' '),
			url: `/audio/${filename}`
		}));
}

export async function deleteAudioFile(filename: string): Promise<boolean> {
	const filepath = path.join(AUDIO_DIR, filename);

	try {
		if (!existsSync(filepath)) return false;

		await unlink(filepath);

		// Also purge the transposed cache for this file
		const basename = filename.replace(/\.[^.]+$/, '');
		const transposedDir = path.join(TRANSPOSED_DIR, basename);
		if (existsSync(transposedDir)) {
			await rm(transposedDir, { recursive: true });
		}

		return true;
	} catch {
		return false;
	}
}

export async function renameAudioFile(oldFilename: string, newTitle: string): Promise<{ success: boolean; newFilename?: string; error?: string }> {
	const oldPath = path.join(AUDIO_DIR, oldFilename);

	if (!existsSync(oldPath)) {
		return { success: false, error: 'File not found' };
	}

	// Extract the video ID from the old filename (last part before .mp3)
	const videoIdMatch = oldFilename.match(/_([^_]+)\.mp3$/);
	const videoId = videoIdMatch ? videoIdMatch[1] : Date.now().toString();

	// Sanitize the new title
	const sanitizedTitle = newTitle
		.replace(/[^a-zA-Z0-9\s-]/g, '')
		.replace(/\s+/g, '_')
		.substring(0, 50);

	const newFilename = `${sanitizedTitle}_${videoId}.mp3`;
	const newPath = path.join(AUDIO_DIR, newFilename);

	try {
		await fsRename(oldPath, newPath);

		// Move transposed cache to match new basename
		const oldBasename = oldFilename.replace(/\.[^.]+$/, '');
		const newBasename = newFilename.replace(/\.[^.]+$/, '');
		const oldTransposedDir = path.join(TRANSPOSED_DIR, oldBasename);
		const newTransposedDir = path.join(TRANSPOSED_DIR, newBasename);
		if (existsSync(oldTransposedDir)) {
			await fsRename(oldTransposedDir, newTransposedDir);
		}

		return { success: true, newFilename };
	} catch (err) {
		return { success: false, error: err instanceof Error ? err.message : 'Failed to rename' };
	}
}
