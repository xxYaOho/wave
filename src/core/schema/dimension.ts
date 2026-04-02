import { z } from 'zod';

export const dimensionEntrySchema = z.object({
  global: z.object({
    dimension: z.record(z.string(), z.unknown()),
  }),
});

export const dimensionSchema = z.record(z.string(), dimensionEntrySchema).refine(
  (obj) => Object.keys(obj).length === 1,
  {
    message: 'Dimension must have exactly one top-level namespace',
  }
);

export type DimensionSchema = z.infer<typeof dimensionSchema>;
