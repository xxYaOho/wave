import * as fs from 'node:fs/promises';

const PNG_SIGNATURE = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export interface PngSize {
	width: number;
	height: number;
}

export async function readPngSize(filePath: string): Promise<PngSize> {
	const handle = await fs.open(filePath, 'r');
	try {
		const header = Buffer.alloc(24);
		const { bytesRead } = await handle.read(header, 0, header.length, 0);
		if (
			bytesRead < header.length ||
			!header.subarray(0, 8).equals(PNG_SIGNATURE)
		) {
			throw new Error(`Not a PNG file: ${filePath}`);
		}

		return {
			width: header.readUInt32BE(16),
			height: header.readUInt32BE(20),
		};
	} finally {
		await handle.close();
	}
}
