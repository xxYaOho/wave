import type { ManualData } from '../../core/manual/types.ts';

export async function loadManualData(): Promise<ManualData> {
	const response = await fetch('/manual-data.json');

	if (!response.ok) {
		throw new Error(`Failed to load manual data: ${response.status}`);
	}

	return (await response.json()) as ManualData;
}
