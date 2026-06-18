import * as path from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
};

export interface ManualServerOptions {
	appDir: string;
	host: string;
	port: number;
}

export async function findAvailablePort(
	host: string,
	start: number,
): Promise<number> {
	for (let port = start; port < start + 20; port++) {
		try {
			const server = Bun.serve({
				hostname: host,
				port,
				fetch: () => new Response('ok'),
			});
			server.stop(true);
			return port;
		} catch {}
	}
	throw new Error(`No available port found from ${start}`);
}

function safeJoin(root: string, requestPath: string): string {
	const rootPath = path.resolve(root);
	const pathname = decodeURIComponent(
		new URL(requestPath, 'http://local').pathname,
	);
	const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
	const filePath = path.resolve(rootPath, relative);

	if (filePath !== rootPath && !filePath.startsWith(`${rootPath}${path.sep}`)) {
		return path.join(rootPath, 'index.html');
	}

	return filePath;
}

export function startManualServer(
	options: ManualServerOptions,
): ReturnType<typeof Bun.serve> {
	return Bun.serve({
		hostname: options.host,
		port: options.port,
		async fetch(request) {
			const url = new URL(request.url);
			let filePath = safeJoin(options.appDir, url.pathname);
			let file = Bun.file(filePath);

			if (!(await file.exists())) {
				if (path.extname(filePath)) {
					return new Response('Not found', { status: 404 });
				}
				filePath = path.join(options.appDir, 'index.html');
				file = Bun.file(filePath);
			}

			return new Response(file, {
				headers: {
					'content-type':
						CONTENT_TYPES[path.extname(filePath)] ?? 'application/octet-stream',
				},
			});
		},
	});
}
