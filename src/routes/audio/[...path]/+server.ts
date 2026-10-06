import { createReadStream, existsSync, statSync } from 'fs';
import { extname, join, normalize } from 'path';
import { error } from '@sveltejs/kit';

const AUDIO_BASE = 'build/client/audio';

// Only serve audio file types
const ALLOWED_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac']);

export const GET = ({ params }: { params: { path: string } }) => {
	// Normalize and prevent path traversal
	const safePath = normalize(params.path).replace(/^(\.\.(\/|\\|$))+/, '');
	const ext = extname(safePath).toLowerCase();

	if (!ALLOWED_EXTENSIONS.has(ext)) {
		throw error(403, 'Forbidden');
	}

	const filePath = join(AUDIO_BASE, safePath);

	if (!existsSync(filePath)) {
		throw error(404, 'Not found');
	}

	const stat = statSync(filePath);
	const stream = createReadStream(filePath);

	return new Response(stream as unknown as ReadableStream, {
		headers: {
			'content-type': 'audio/mpeg',
			'content-length': String(stat.size),
			'accept-ranges': 'bytes',
			'cache-control': 'public, max-age=3600'
		}
	});
};
