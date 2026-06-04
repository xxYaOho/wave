import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import { resourceStatePath } from './paths.ts';

const tailwindStateSchema = z
	.object({
		updatedBefore: z.boolean().optional(),
		requestedVersion: z.string().optional(),
		resolvedVersion: z.string().optional(),
		activeMajor: z.number().optional(),
	})
	.passthrough();

const leonardoStateSchema = z
	.object({
		updatedBefore: z.boolean().optional(),
		recipe: z.enum(['user', 'builtin']).optional(),
	})
	.passthrough();

const resourceStateSchema = z
	.object({
		tailwindcss: tailwindStateSchema.optional(),
		leonardo: leonardoStateSchema.optional(),
	})
	.passthrough();

export type ResourceState = z.infer<typeof resourceStateSchema>;

export async function readResourceState(): Promise<ResourceState> {
	const filePath = resourceStatePath();
	try {
		const raw = await fs.readFile(filePath, 'utf-8');
		const parsed = JSON.parse(raw) as unknown;
		const result = resourceStateSchema.safeParse(parsed);
		if (!result.success) return {};
		return result.data;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
		return {};
	}
}

export async function writeResourceState(state: ResourceState): Promise<void> {
	const filePath = resourceStatePath();
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
}
