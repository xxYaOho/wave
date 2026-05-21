import { Command } from 'commander';
import { createBuildCommand } from './create.ts';
import { createDoctorCommand } from './doctor.ts';
import { createInitCommand } from './init.ts';
import { createShowCommand } from './show.ts';

function createWcagCommand(): Command {
	return new Command('wcag')
		.description('Run WCAG contrast checks')
		.argument('[scope]', 'Theme scope: main or variant name')
		.option('-f, --file <path>', 'Themefile path to validate')
		.option('--night', 'Check night variant')
		.option('--variants <name>', 'Check specific variant by name')
		.action(
			async (
				scope: string | undefined,
				options: { file?: string; night?: boolean; variants?: string },
			) => {
				const args = ['--contrast'];
				if (options.file) {
					args.push('--file', options.file);
				}
				if (options.night) {
					args.push('--night');
				}
				const variant =
					options.variants ?? (scope === 'main' ? undefined : scope);
				if (variant) {
					args.push('--variants', variant);
				}
				const doctor = createDoctorCommand('doctor');
				await doctor.parseAsync(['bun', 'wave dt wcag', ...args], {
					from: 'node',
				});
			},
		);
}

export const dtCommand = new Command('dt')
	.description('Design token tools')
	.addCommand(createBuildCommand('build'))
	.addCommand(createInitCommand('init'))
	.addCommand(createShowCommand('show'))
	.addCommand(createDoctorCommand('doctor'))
	.addCommand(createWcagCommand());
