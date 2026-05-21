import { Command } from 'commander';
import { createBuildCommand } from './create.ts';
import { createDoctorCommand } from './doctor.ts';
import { createInitCommand } from './init.ts';
import { createShowCommand } from './show.ts';

function createWcagCommand(): Command {
	return new Command('wcag')
		.description('Run WCAG contrast checks')
		.option('-f, --file <path>', 'Themefile path to validate')
		.option('--night', 'Check night variant')
		.option('--variants <name>', 'Check specific variant by name')
		.action(async () => {
			const doctor = createDoctorCommand('doctor');
			await doctor.parseAsync(
				['bun', 'wave dt wcag', '--contrast', ...process.argv.slice(4)],
				{ from: 'node' },
			);
		});
}

export const dtCommand = new Command('dt')
	.description('Design token tools')
	.addCommand(createBuildCommand('build'))
	.addCommand(createInitCommand('init'))
	.addCommand(createShowCommand('show'))
	.addCommand(createDoctorCommand('doctor'))
	.addCommand(createWcagCommand());
