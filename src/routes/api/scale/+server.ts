import { setScale } from '$lib/server/audio';
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
		typeof (body as Record<string, unknown>).scale !== 'string'
	) {
		throw error(400, 'filename (string) and scale (string) are required');
	}

	const { filename, scale } = body as { filename: string; scale: string };

	// Strict filename validation to prevent path traversal / JSON key injection abuse
	if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
		throw error(400, 'Invalid filename');
	}

	if (scale.length > 100) {
		throw error(400, 'Scale text is too long');
	}

	await setScale(filename, scale);

	return json({ success: true });
};
