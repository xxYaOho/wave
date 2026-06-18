import { spawn } from 'node:child_process';
import { Command } from 'commander';
import { resolveManualAppDir } from '../../core/manual/assets.ts';
import {
	findAvailablePort,
	startManualServer,
} from '../../core/manual/server.ts';
import { ExitCode } from '../../types/index.ts';

interface ManualCommandOptions {
	host?: string;
	open?: boolean;
	port?: string;
}

const MANUAL_HELP = `Wave Manual
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  Usage:
    wave manual [options]

  Options:
    --port <port>      Port to bind. Default: 4567
    --host <host>      Host to bind. Default: 127.0.0.1
    --no-open          Do not open the browser automatically
    -h, --help         Show help`;

function parsePort(value: string | undefined): number {
	if (!value) return 4567;

	const port = Number(value);
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error('--port must be an integer from 1 to 65535');
	}

	return port;
}

function openBrowser(url: string): void {
	const command =
		process.platform === 'darwin'
			? 'open'
			: process.platform === 'win32'
				? 'cmd'
				: 'xdg-open';
	const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
	const child = spawn(command, args, { detached: true, stdio: 'ignore' });
	child.unref();
}

export const manualCommand = new Command('manual')
	.description('Open the local Wave manual')
	.helpOption(false)
	.addHelpCommand(false)
	.option('-h, --help', 'Show help')
	.option('--port <port>', 'Port to bind. Default: 4567')
	.option('--host <host>', 'Host to bind. Default: 127.0.0.1')
	.option('--no-open', 'Do not open the browser automatically')
	.action(async (options: ManualCommandOptions & { help?: boolean }) => {
		if (options.help) {
			console.log(MANUAL_HELP);
			process.exitCode = ExitCode.SUCCESS;
			return;
		}

		try {
			const host = options.host ?? '127.0.0.1';
			const requestedPort = parsePort(options.port);
			const port = options.port
				? requestedPort
				: await findAvailablePort(host, requestedPort);
			const appDir = await resolveManualAppDir();
			const server = startManualServer({ appDir, host, port });
			const localUrl = `http://127.0.0.1:${server.port}/`;

			console.log('Wave Manual');
			console.log(`Local: ${localUrl}`);
			if (host === '0.0.0.0') {
				console.log(`Network: http://0.0.0.0:${server.port}/`);
			}
			console.log('Press Ctrl+C to stop.');

			if (options.open !== false) {
				try {
					openBrowser(localUrl);
				} catch {
					console.error(`Could not open browser. Open manually: ${localUrl}`);
				}
			}

			await new Promise<void>((resolve) => {
				process.once('SIGINT', () => {
					server.stop(true);
					resolve();
				});
			});
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error));
			process.exitCode = ExitCode.GENERAL_ERROR;
		}
	});
