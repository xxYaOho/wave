import type {
	ToolCapability,
	ToolModule,
	ToolRequirementDefinition,
} from './types.ts';

export const TOOL_CANDIDATES: Record<ToolCapability, string[]> = {
	'compress-png': ['oxipng', 'pngquant'],
	'compress-jpg': ['jpegtran', 'mozjpeg'],
	'compress-svg': ['svgo'],
	'compress-gif': ['gifsicle'],
	'encode-gif': ['gifski'],
	'encode-apng': ['apngasm'],
};

export const TOOL_VERSION_ARGS: Record<string, string[]> = {
	oxipng: ['--version'],
	pngquant: ['--version'],
	jpegtran: ['-version'],
	mozjpeg: ['-version'],
	svgo: ['--version'],
	gifsicle: ['--version'],
	gifski: ['--version'],
	apngasm: ['--version'],
	mise: ['--version'],
};

export const TOOL_INSTALL_GROUPS: Record<ToolModule, string[]> = {
	core: [
		'bun',
		'node',
		'pnpm',
		'oxipng',
		'pngquant',
		'svgo',
		'gifsicle',
		'gifski',
		'apngasm',
		'jpegtran or mozjpeg',
	],
	compress: ['oxipng', 'pngquant', 'svgo', 'gifsicle', 'jpegtran or mozjpeg'],
	motion: ['gifski', 'apngasm'],
};

export const COMPRESS_TOOL_REQUIREMENTS: ToolRequirementDefinition[] = [
	{
		module: 'compress',
		requiredFor: 'PNG safe compression',
		requirement: {
			capability: 'compress-png',
			mode: 'safe',
			preferred: ['oxipng'],
		},
	},
	{
		module: 'compress',
		requiredFor: 'JPG safe compression',
		requirement: {
			capability: 'compress-jpg',
			mode: 'safe',
			preferred: ['jpegtran', 'mozjpeg'],
		},
	},
	{
		module: 'compress',
		requiredFor: 'SVG compression',
		requirement: {
			capability: 'compress-svg',
			mode: 'safe',
			preferred: ['svgo'],
		},
	},
	{
		module: 'compress',
		requiredFor: 'GIF compression',
		requirement: {
			capability: 'compress-gif',
			mode: 'safe',
			preferred: ['gifsicle'],
		},
	},
	{
		module: 'compress',
		requiredFor: 'PNG lossy compression',
		requirement: {
			capability: 'compress-png',
			mode: 'quality',
			preferred: ['pngquant'],
		},
	},
	{
		module: 'compress',
		requiredFor: 'JPG lossy compression',
		requirement: {
			capability: 'compress-jpg',
			mode: 'quality',
			preferred: ['mozjpeg'],
		},
	},
];

export const MOTION_TOOL_REQUIREMENTS: ToolRequirementDefinition[] = [
	{
		module: 'motion',
		requiredFor: 'GIF encoding',
		requirement: {
			capability: 'encode-gif',
			mode: 'encode',
			preferred: ['gifski'],
		},
	},
	{
		module: 'motion',
		requiredFor: 'APNG encoding',
		requirement: {
			capability: 'encode-apng',
			mode: 'encode',
			preferred: ['apngasm'],
		},
	},
];

export function getToolRequirements(
	module: ToolModule,
): ToolRequirementDefinition[] {
	if (module === 'compress') return COMPRESS_TOOL_REQUIREMENTS;
	if (module === 'motion') return MOTION_TOOL_REQUIREMENTS;
	return [...COMPRESS_TOOL_REQUIREMENTS, ...MOTION_TOOL_REQUIREMENTS];
}
