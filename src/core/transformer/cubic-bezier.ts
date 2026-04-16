const EPSILON = 1e-7;
const MAX_ITERATIONS = 20;

function cubicBezierX(t: number, x1: number, x2: number): number {
	const it = 1 - t;
	return 3 * it * it * t * x1 + 3 * it * t * t * x2 + t * t * t;
}

function cubicBezierY(t: number, y1: number, y2: number): number {
	const it = 1 - t;
	return 3 * it * it * t * y1 + 3 * it * t * t * y2 + t * t * t;
}

function cubicBezierXDerivative(t: number, x1: number, x2: number): number {
	const it = 1 - t;
	return 3 * it * it * x1 + 6 * it * t * (x2 - x1) + 3 * t * t * (1 - x2);
}

function solveCubicBezierT(targetX: number, x1: number, x2: number): number {
	if (targetX <= 0) return 0;
	if (targetX >= 1) return 1;

	// Try Newton-Raphson first
	let t = targetX;
	let prevDelta = Infinity;

	for (let i = 0; i < 8; i++) {
		const x = cubicBezierX(t, x1, x2) - targetX;
		const dx = cubicBezierXDerivative(t, x1, x2);

		if (Math.abs(dx) < EPSILON) {
			break;
		}

		const delta = x / dx;
		const nextT = t - delta;

		// If diverging or out of bounds, abort Newton-Raphson
		if (nextT < 0 || nextT > 1 || Math.abs(delta) > prevDelta) {
			break;
		}

		t = nextT;
		prevDelta = Math.abs(delta);

		if (Math.abs(delta) < EPSILON) {
			return t;
		}
	}

	// Fallback to bisection
	let low = 0;
	let high = 1;
	t = targetX;

	for (let i = 0; i < MAX_ITERATIONS; i++) {
		const x = cubicBezierX(t, x1, x2) - targetX;

		if (Math.abs(x) < EPSILON) {
			return t;
		}

		const xLow = cubicBezierX(low, x1, x2) - targetX;

		if (xLow * x < 0) {
			high = t;
		} else {
			low = t;
		}

		t = (low + high) / 2;
	}

	return t;
}

/**
 * 对 cubic-bezier 曲线按指定 step 数进行采样。
 * step 包含首尾，即返回 length === steps 的数组。
 * 每个值是曲线在对应 x 位置的 y 值，已 clamp 到 [0, 1]。
 */
export function sampleCubicBezier(
	curve: [number, number, number, number],
	steps: number,
): number[] {
	if (!Number.isInteger(steps) || steps < 2) {
		throw new Error(
			`sampleCubicBezier: steps must be an integer >= 2, got ${steps}`,
		);
	}

	if (
		!Array.isArray(curve) ||
		curve.length !== 4 ||
		!curve.every((n) => typeof n === 'number')
	) {
		throw new Error(`sampleCubicBezier: curve must be an array of 4 numbers`);
	}

	const [x1, y1, x2, y2] = curve;
	const result: number[] = [];

	for (let i = 0; i < steps; i++) {
		const tTarget = i / (steps - 1);
		const bezierT = solveCubicBezierT(tTarget, x1, x2);
		const y = cubicBezierY(bezierT, y1, y2);
		result.push(Math.max(0, Math.min(1, y)));
	}

	return result;
}
