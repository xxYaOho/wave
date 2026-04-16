import process from 'node:process';

export const logger = {
	info: (message: string): void => {
		console.log(`ℹ ${message}`);
	},
	success: (message: string): void => {
		console.log(`✓ ${message}`);
	},
	warn: (message: string): void => {
		console.log(`⚠ ${message}`);
	},
	error: (message: string): void => {
		console.error(`✗ ${message}`);
	},
};

export function exit(code: number, message?: string): never {
	if (message) {
		if (code === 0) {
			logger.success(message);
		} else {
			logger.error(message);
		}
	}
	process.exit(code);
}
