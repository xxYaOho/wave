import type {
	Locale,
	ManualData,
	ManualDataView,
} from '../../core/manual/types.ts';

export async function loadManualData(): Promise<ManualData> {
	const response = await fetch('/manual-data.json');

	if (!response.ok) {
		throw new Error(`Failed to load manual data: ${response.status}`);
	}

	return (await response.json()) as ManualData;
}

/** Select a localized view, falling back to English for incomplete data. */
export function selectManualView(
	data: ManualData,
	locale: Locale,
): ManualDataView | ManualData {
	return data.locales?.[locale] ?? data.locales?.en ?? data;
}
