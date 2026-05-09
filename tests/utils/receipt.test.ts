import { describe, expect, test } from 'bun:test';
import { BuildContext, renderReceipt } from '../../src/utils/receipt.ts';

describe('renderReceipt', () => {
	test('renders success receipt with all sections', () => {
		const ctx = new BuildContext();
		ctx.themeName = 'orca';
		ctx.version = '0.15.0';
		ctx.outputDir = 'theme/';
		ctx.addResource('palette', 'tailwindcss4', 'builtin');
		ctx.addResource('dimension', 'wave', 'builtin');
		ctx.addOutput('main', ['orca.json', 'orca.css']);
		ctx.setNight('skipped');
		ctx.setVariants('enabled', 1, ['assistant-app']);

		const out = renderReceipt(ctx);

		expect(out).toContain('ORCA');
		expect(out).toContain('Build Receipt');
		expect(out).toContain('0.15.0');
		expect(out).toContain('RESOURCES');
		expect(out).toContain('palette');
		expect(out).toContain('tailwindcss4');
		expect(out).toContain('OUTPUTS');
		expect(out).toContain('orca.json');
		expect(out).toContain('Night mode');
		expect(out).toContain('Variants');
		expect(out).toContain('Theme generation complete');
		expect(out).toContain('Cheers >_<');
	});

	test('renders failed receipt with error section', () => {
		const ctx = new BuildContext();
		ctx.themeName = 'orca';
		ctx.version = '0.15.0';
		ctx.markFailed('resource', 'palette not found', {
			phase: 'resource resolve',
			detail: '→ tailwindcss5',
		});

		const out = renderReceipt(ctx);

		expect(out).toContain('BUILD FAILED');
		expect(out).toContain('Error Receipt');
		expect(out).toContain('ERRORS');
		expect(out).toContain('resource');
		expect(out).toContain('palette not found');
		expect(out).toContain('Failed at: resource resolve');
	});

	test('renders receipt with no resources or outputs', () => {
		const ctx = new BuildContext();
		ctx.themeName = 'empty';
		ctx.version = '1.0.0';
		ctx.outputDir = 'out/';
		ctx.setNight('disabled');
		ctx.setVariants('none', 0, []);

		const out = renderReceipt(ctx);

		expect(out).toContain('EMPTY');
		expect(out).toContain('1.0.0');
		expect(out).not.toContain('RESOURCES');
		expect(out).not.toContain('OUTPUTS');
	});
});
