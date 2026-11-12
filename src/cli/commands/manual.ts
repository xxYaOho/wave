import { Command } from 'commander';
import { ExitCode } from '../../types/index.ts';
import { lazyAction } from './lazy-action.ts';

interface ManualCommandOptions {
	host?: string;
	open?: boolean;
	port?: string;
	help?: boolean;
}
export const manualCommand = new Command('manual')
	.description('Open the local Wave manual')
	.helpOption(false)
	.addHelpCommand(false)
	.option('-h, --help', 'Show help')
	.option('--port <port>', 'Port to bind. Default: 4567')
	.option('--host <host>', 'Host to bind. Default: 127.0.0.1')
	.option('--no-open', 'Do not open the browser automatically')
	.action(async function (options: ManualCommandOptions, command: Command) {
		if (options.help) {
			console.log(command.helpInformation());
			process.exitCode = ExitCode.SUCCESS;
			return;
		}
		return lazyAction(
			'manual',
			async () => (await import('./manual-action.ts')).runManual,
		).call(this, options);
	});
