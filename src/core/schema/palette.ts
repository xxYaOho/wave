import { z } from 'zod';

export const paletteEntrySchema = z.object({
	color: z.record(z.string(), z.unknown()),
});

export const paletteSchema = z
	.record(z.string(), paletteEntrySchema)
	.refine((obj) => Object.keys(obj).length === 1, {
		message: 'Palette must have exactly one top-level namespace',
	});

export type PaletteSchema = z.infer<typeof paletteSchema>;
