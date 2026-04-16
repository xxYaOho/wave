/**
 * 将数值按指定小数位进行四舍五入。
 * 可用于 position、百分比、RGB 分量等多种场景的格式化。
 */
export function roundTo(value: number, fractionDigits = 2): number {
	const factor = 10 ** fractionDigits;
	return Math.round(value * factor) / factor;
}
