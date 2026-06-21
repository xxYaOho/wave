import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';

export function sha256Text(content: string): string {
	return createHash('sha256').update(content).digest('hex');
}

export async function sha256File(filePath: string): Promise<string> {
	const content = await fs.readFile(filePath);
	return createHash('sha256').update(content).digest('hex');
}
