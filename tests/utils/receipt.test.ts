import { describe, expect, test } from 'bun:test';
import {
	BuildContext,
	renderReceipt,
	vlen,
	vpad,
	vtruncate,
} from '../../src/utils/receipt.ts';

describe('renderReceipt', () => {
	test('renders success receipt with all sections', () => {
		const ctx = new BuildContext();
		ctx.themeName = 'orca';
		ctx.version = '0.15.0';
		ctx.outputDir = 'theme/';
		ctx.addResource('palette', 'tailwindcss', 'builtin');
		ctx.addResource('dimension', 'wave', 'builtin');
		ctx.addOutput('main', ['orca.json', 'orca.css']);
		ctx.setNight('skipped');
		ctx.setProfiles('single', 1, ['assistant-app']);

		const out = renderReceipt(ctx);

		expect(out).toContain('ORCA');
		expect(out).toContain('Build Receipt');
		expect(out).toContain('0.15.0');
		expect(out).toContain('RESOURCES');
		expect(out).toContain('palette');
		expect(out).toContain('tailwindcss');
		expect(out).toContain('OUTPUTS');
		expect(out).toContain('orca.json');
		expect(out).toContain('Night mode');
		expect(out).toContain('Profiles');
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
		expect(out).toContain('resource resolve');
		expect(out).toContain('not found');
		expect(out).toContain('Failed at: resource resolve');
	});

	test('renders success receipt with warnings', () => {
		const ctx = new BuildContext();
		ctx.themeName = 'orca';
		ctx.version = '0.15.0';
		ctx.outputDir = 'theme/';
		ctx.addWarning(
			'main',
			'No main.yaml found. Direct RESOURCE token generation is deprecated.',
		);

		const out = renderReceipt(ctx);

		expect(ctx.warnings[0]?.message).toContain(
			'Direct RESOURCE token generation is deprecated',
		);
		expect(out).toContain('WARNINGS');
		expect(out).toContain('main');
		expect(out).toContain('No main.yaml found');
	});

	test('renders failed receipt with warnings before errors', () => {
		const ctx = new BuildContext();
		ctx.themeName = 'orca';
		ctx.version = '0.15.0';
		ctx.addWarning(
			'main',
			'No main.yaml found. Direct RESOURCE token generation is deprecated.',
		);
		ctx.markFailed('generate', 'failed to generate', {
			phase: 'main generate',
		});

		const out = renderReceipt(ctx);

		expect(out).toContain('WARNINGS');
		expect(out).toContain('ERRORS');
		expect(out.indexOf('WARNINGS')).toBeLessThan(out.indexOf('ERRORS'));
	});

	test('renders receipt with no resources or outputs', () => {
		const ctx = new BuildContext();
		ctx.themeName = 'empty';
		ctx.version = '1.0.0';
		ctx.outputDir = 'out/';
		ctx.setNight('disabled');
		ctx.setProfiles('default', 1, ['main']);

		const out = renderReceipt(ctx);

		expect(out).toContain('EMPTY');
		expect(out).toContain('1.0.0');
		expect(out).not.toContain('RESOURCES');
		expect(out).not.toContain('OUTPUTS');
	});

	test('measures and truncates CJK visual width', () => {
		expect(vlen('会见管理.png')).toBe(12);
		expect(vpad('会见', 6)).toBe('会见  ');
		expect(vtruncate('刑释人员校验.png', 10)).toBe('刑释人...');
	});
});
