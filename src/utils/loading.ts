import yoctoSpinner, { type Spinner } from 'yocto-spinner';

export interface LoadingHandle {
	stop(): void;
}

export function startLoading(text: string): LoadingHandle {
	if (!shouldShowLoading()) {
		return { stop() {} };
	}

	const spinner = yoctoSpinner({
		text,
		stream: process.stderr,
		handleSignals: false,
	}).start();

	return {
		stop() {
			stopSpinner(spinner);
		},
	};
}

function shouldShowLoading(): boolean {
	return (
		process.stderr.isTTY === true &&
		process.env.CI === undefined &&
		process.env.TERM !== 'dumb'
	);
}

function stopSpinner(spinner: Spinner): void {
	if (spinner.isSpinning) {
		spinner.stop();
	}
}
