import pc from 'picocolors';

const FRAMES = [
	'⠖⠉⠉⠑',
	'⡠⠖⠉⠉',
	'⣠⡠⠖⠉',
	'⣄⣠⡠⠖',
	'⠢⣄⣠⡠',
	'⠙⠢⣄⣠',
	'⠉⠙⠢⣄',
	'⠊⠉⠙⠢',
	'⠜⠊⠉⠙',
	'⡤⠜⠊⠉',
	'⣀⡤⠜⠊',
	'⢤⣀⡤⠜',
	'⠣⢤⣀⡤',
	'⠑⠣⢤⣀',
	'⠉⠑⠣⢤',
	'⠋⠉⠑⠣',
];
const INTERVAL_MS = 90;
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const CLEAR_LINE = '\r\x1b[K';

export class WaveSpinner {
	private timer?: ReturnType<typeof setInterval>;
	private frameIdx = 0;
	private message = '';
	private active = false;
	private readonly isTTY: boolean;

	constructor() {
		this.isTTY = process.stdout.isTTY === true;
	}

	start(message: string): void {
		if (!this.isTTY) return;
		this.message = message;
		this.active = true;
		this.frameIdx = 0;
		process.stdout.write(HIDE_CURSOR);
		this.timer = setInterval(() => this.render(), INTERVAL_MS);
	}

	update(message: string): void {
		if (!this.active) return;
		this.message = message;
	}

	stop(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
		if (this.isTTY && this.active) {
			process.stdout.write(`${CLEAR_LINE}${SHOW_CURSOR}`);
		}
		this.active = false;
	}

	private render(): void {
		const frame = FRAMES[this.frameIdx];
		process.stdout.write(
			`${CLEAR_LINE}${pc.cyan(frame)}  ${pc.dim(this.message)}`,
		);
		this.frameIdx = (this.frameIdx + 1) % FRAMES.length;
	}
}
