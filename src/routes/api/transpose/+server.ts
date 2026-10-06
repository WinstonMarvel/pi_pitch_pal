import { transposeAudio } from '$lib/server/audio';
import { json, error } from '@sveltejs/kit';

export const POST = async ({ request }: { request: Request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	if (
		typeof body !== 'object' ||
		body === null ||
		typeof (body as Record<string, unknown>).filename !== 'string' ||
		typeof (body as Record<string, unknown>).semitones !== 'number'
	) {
		throw error(400, 'filename (string) and semitones (number) are required');
	}

	const { filename, semitones } = body as { filename: string; semitones: number };

	if (semitones === 0) {
		return json({ url: `/audio/${filename}` });
	}

	const result = await transposeAudio(filename, semitones);

	if (!result.success) {
		throw error(500, result.error ?? 'Transpose failed');
	}

	return json({ url: result.url });
};
