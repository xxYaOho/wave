import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { PairedComparisonContract } from '../benchmarks/shared/compare.ts';

export const P1B_ITERATIONS = 30;
export const P1B_WARMUP = 3;

export const P1B_DOMAINS = [
	'token-single-profile',
	'token-multi-profile',
	'night',
] as const;

export type P1bDomain = (typeof P1B_DOMAINS)[number];

export interface P1bRuleCheck {
	rule: string;
	threshold: string;
	measured: number | null;
	pass: boolean;
}

export interface P1bStatisticsRef {
	report: string;
	runId: string;
	caseId: string;
	reportSha256: string;
	manifestRef: string;
}

export interface P1bComparisonRef {
	path: string;
	sha256: string;
	baseRunId: string;
	currentRunId: string;
}

export interface P1bStatisticsCase {
	key: string;
	domain: P1bDomain;
	baselineStatsRef: P1bStatisticsRef;
	currentStatsRef: P1bStatisticsRef;
	comparisonRef: P1bComparisonRef;
	paired: PairedComparisonContract;
	ruleChecks: P1bRuleCheck[];
}

export interface P1bStatistics {
	schemaVersion: 1;
	anchors: { pre: string; post: string };
	protocol: {
		iterations: number;
		warmup: number;
		bun: string;
		lockfileHashes: { pre: string; post: string };
		manifests: { pre: string; post: string };
	};
	cases: P1bStatisticsCase[];
	globalRuleChecks: P1bRuleCheck[];
	validity: {
		domainsComplete: boolean;
		sampleCountsExact: boolean;
		lockfileHashesPresent: boolean;
		reportsExist: boolean;
	};
	verdict: 'retained' | 'escalate' | 'invalid';
}

export interface ComposeP1bOptions {
	evidenceDir: string;
	preReport: string;
	postReport: string;
	comparison: string;
	out: string;
	preManifest?: string;
	postManifest?: string;
}

interface LooseRecord {
	[key: string]: unknown;
}

interface LoadedJson {
	path: string;
	ref: string;
	value: LooseRecord | null;
	sha256: string;
	exists: boolean;
}

interface ReportCase extends LooseRecord {
	id?: unknown;
	domain?: unknown;
	status?: unknown;
	iterations?: unknown;
	warmup?: unknown;
	stats?: LooseRecord;
	cacheAttribution?: unknown;
}

interface Report extends LooseRecord {
	runId?: unknown;
	cases?: unknown;
	environment?: LooseRecord;
	node?: unknown;
	bun?: unknown;
}

interface Manifest extends LooseRecord {
	runId?: unknown;
	anchorArg?: unknown;
	anchorCommit?: unknown;
	iterations?: unknown;
	warmup?: unknown;
	lockfileHash?: unknown;
	report?: unknown;
	runtime?: LooseRecord;
	hostLoad?: LooseRecord;
}

interface Comparison extends LooseRecord {
	baseRunId?: unknown;
	currentRunId?: unknown;
	cases?: unknown;
}

interface ComparisonCase extends LooseRecord {
	id?: unknown;
	comparisonKey?: unknown;
	domain?: unknown;
	paired?: unknown;
}

function isRecord(value: unknown): value is LooseRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null;
}

function finiteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function exactHex(value: unknown, length: number): value is string {
	return (
		typeof value === 'string' &&
		new RegExp(`^[0-9a-fA-F]{${length}}$`).test(value)
	);
}

function asReport(value: LooseRecord | null): Report | null {
	return value;
}

function asManifest(value: LooseRecord | null): Manifest | null {
	return value;
}

function asComparison(value: LooseRecord | null): Comparison | null {
	return value;
}

function reportCases(report: Report | null): ReportCase[] {
	if (!report || !Array.isArray(report.cases)) return [];
	return report.cases.filter(isRecord) as ReportCase[];
}

function comparisonCases(comparison: Comparison | null): ComparisonCase[] {
	if (!comparison || !Array.isArray(comparison.cases)) return [];
	return comparison.cases.filter(isRecord) as ComparisonCase[];
}

function caseKey(
	testCase: ReportCase | ComparisonCase | undefined,
): string | null {
	if (!testCase) return null;
	return stringValue(testCase.comparisonKey) ?? stringValue(testCase.id);
}

function domainFor(value: unknown): P1bDomain | null {
	return P1B_DOMAINS.includes(value as P1bDomain) ? (value as P1bDomain) : null;
}

function reportCaseFor(
	report: Report | null,
	domain: P1bDomain,
): ReportCase | undefined {
	return reportCases(report).find(
		(testCase) => domainFor(testCase.domain) === domain,
	);
}

function comparisonCaseFor(
	comparison: Comparison | null,
	domain: P1bDomain,
): ComparisonCase | undefined {
	return comparisonCases(comparison).find((testCase) => {
		return (
			domainFor(testCase.domain) === domain || caseKey(testCase) === domain
		);
	});
}

function samplesFor(testCase: ReportCase | undefined): unknown[] {
	const samples = testCase?.stats?.samplesMs;
	return Array.isArray(samples) ? samples : [];
}

function samplesAreExact(testCase: ReportCase | undefined): boolean {
	const samples = samplesFor(testCase);
	return (
		testCase?.status === 'success' &&
		testCase.iterations === P1B_ITERATIONS &&
		testCase.warmup === P1B_WARMUP &&
		samples.length === P1B_ITERATIONS &&
		samples.every(finiteNumber)
	);
}

function layerHits(testCase: ReportCase | undefined, layer: string): number {
	if (!Array.isArray(testCase?.cacheAttribution)) return 0;
	return testCase.cacheAttribution.reduce((sum, trace) => {
		if (!isRecord(trace) || trace.layer !== layer) return sum;
		return sum + (finiteNumber(trace.hits) && trace.hits >= 0 ? trace.hits : 0);
	}, 0);
}

function pairedContract(value: unknown): PairedComparisonContract | null {
	if (!isRecord(value)) return null;
	const countFields = [
		'baselineSampleCount',
		'currentSampleCount',
		'positiveBaselineCount',
		'winCount',
		'lossCount',
		'tieCount',
		'excludedNonPositiveBaseline',
	];
	if (
		stringValue(value.key) === null ||
		value.metric !== 'p50Ms' ||
		value.unit !== 'ms' ||
		!Array.isArray(value.pairedDeltasMs) ||
		!value.pairedDeltasMs.every(finiteNumber) ||
		(value.medianRelativeImprovement !== null &&
			!finiteNumber(value.medianRelativeImprovement)) ||
		(value.p95RelativeRegression !== null &&
			!finiteNumber(value.p95RelativeRegression)) ||
		!['paired-index', 'aggregate-fallback'].includes(String(value.method)) ||
		countFields.some(
			(field) =>
				!finiteNumber(value[field]) ||
				(value[field] as number) < 0 ||
				!Number.isInteger(value[field]),
		)
	) {
		return null;
	}
	return value as unknown as PairedComparisonContract;
}

function stableValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stableValue);
	if (!isRecord(value)) return value;
	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.map((key) => [key, stableValue(value[key])]),
	);
}

function sameJson(left: unknown, right: unknown): boolean {
	return (
		JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right))
	);
}

function sha256(content: Uint8Array): string {
	return crypto.createHash('sha256').update(content).digest('hex');
}

async function loadJson(evidenceDir: string, ref: string): Promise<LoadedJson> {
	const filePath = path.resolve(evidenceDir, ref);
	try {
		const content = await fs.readFile(filePath);
		let value: LooseRecord | null = null;
		try {
			const parsed: unknown = JSON.parse(content.toString('utf8'));
			value = isRecord(parsed) ? parsed : null;
		} catch {
			value = null;
		}
		return {
			path: filePath,
			ref,
			value,
			sha256: sha256(content),
			exists: true,
		};
	} catch {
		return { path: filePath, ref, value: null, sha256: '', exists: false };
	}
}

function relativeRef(ref: string): string {
	return ref.replaceAll('\\', '/').replace(/^\.\//, '');
}

function defaultManifestRef(report: Report | null, reportRef: string): string {
	const runId = stringValue(report?.runId);
	if (runId) return `${runId}.capture-manifest.json`;
	return `${path.basename(reportRef, path.extname(reportRef))}.capture-manifest.json`;
}

function checkRefManifest(
	manifest: Manifest | null,
	report: Report | null,
	reportRef: string,
	anchor: string,
): boolean {
	if (!manifest || !report) return false;
	const reportRunId = stringValue(report.runId);
	const manifestRunId = stringValue(manifest.runId);
	const reportName = path.basename(relativeRef(reportRef));
	const manifestReport = stringValue(manifest.report);
	return (
		reportRunId !== null &&
		reportRunId === manifestRunId &&
		manifestReport !== null &&
		(manifestReport === relativeRef(reportRef) ||
			path.basename(manifestReport) === reportName) &&
		stringValue(manifest.anchorCommit) === anchor
	);
}

function checkRuntime(
	manifest: Manifest | null,
	report: Report | null,
): boolean {
	if (
		!manifest ||
		!report?.environment ||
		!manifest.runtime ||
		!manifest.hostLoad
	)
		return false;
	const node = stringValue(manifest.runtime.node);
	const bun = stringValue(manifest.runtime.bun);
	const loadStart = stringValue(manifest.hostLoad.load1mStart);
	const loadEnd = stringValue(manifest.hostLoad.load1mEnd);
	return (
		node !== null &&
		bun !== null &&
		stringValue(report.environment.node) === node &&
		stringValue(report.environment.bun) === bun &&
		loadStart !== null &&
		loadEnd !== null
	);
}

function checkManifestProtocol(manifest: Manifest | null): boolean {
	return (
		manifest !== null &&
		manifest.iterations === P1B_ITERATIONS &&
		manifest.warmup === P1B_WARMUP
	);
}

function makeRule(
	rule: string,
	threshold: string,
	measured: number | null,
	pass: boolean,
): P1bRuleCheck {
	return { rule, threshold, measured, pass };
}

function ruleChecksFor(
	domain: P1bDomain,
	paired: PairedComparisonContract | null,
	currentCase: ReportCase | undefined,
): P1bRuleCheck[] {
	const ri = paired?.medianRelativeImprovement ?? null;
	if (domain === 'token-multi-profile') {
		const pr = paired?.p95RelativeRegression ?? null;
		const dictHits = layerHits(currentCase, 'dictionary');
		const loadHits = layerHits(currentCase, 'loadResource');
		return [
			makeRule('RI', '>= 0', ri, ri !== null && ri >= 0),
			makeRule('PR', '<= 0.10', pr, pr !== null && pr <= 0.1),
			makeRule('dictHits', '> 0', dictHits, dictHits > 0),
			makeRule('loadHits', '> 0', loadHits, loadHits > 0),
		];
	}
	if (domain === 'night') {
		return [makeRule('RI', '>= 0', ri, ri !== null && ri >= 0)];
	}
	return [makeRule('RI', '>= -0.03', ri, ri !== null && ri >= -0.03)];
}

export async function composeP1bStatistics(
	options: ComposeP1bOptions,
): Promise<P1bStatistics> {
	const evidenceDir = path.resolve(options.evidenceDir);
	const preReportRef = relativeRef(options.preReport);
	const postReportRef = relativeRef(options.postReport);
	const comparisonRef = relativeRef(options.comparison);
	const preLoaded = await loadJson(evidenceDir, preReportRef);
	const postLoaded = await loadJson(evidenceDir, postReportRef);
	const comparisonLoaded = await loadJson(evidenceDir, comparisonRef);
	const preReport = asReport(preLoaded.value);
	const postReport = asReport(postLoaded.value);
	const comparison = asComparison(comparisonLoaded.value);
	const preManifestRef = relativeRef(
		options.preManifest ?? defaultManifestRef(preReport, preReportRef),
	);
	const postManifestRef = relativeRef(
		options.postManifest ?? defaultManifestRef(postReport, postReportRef),
	);
	const preManifestLoaded = await loadJson(evidenceDir, preManifestRef);
	const postManifestLoaded = await loadJson(evidenceDir, postManifestRef);
	const preManifest = asManifest(preManifestLoaded.value);
	const postManifest = asManifest(postManifestLoaded.value);

	const preAnchor = stringValue(preManifest?.anchorCommit) ?? '';
	const postAnchor = stringValue(postManifest?.anchorCommit) ?? '';
	const protocol: P1bStatistics['protocol'] = {
		iterations: P1B_ITERATIONS,
		warmup: P1B_WARMUP,
		bun:
			stringValue(postManifest?.runtime?.bun) ??
			stringValue(preManifest?.runtime?.bun) ??
			'',
		lockfileHashes: {
			pre: stringValue(preManifest?.lockfileHash) ?? '',
			post: stringValue(postManifest?.lockfileHash) ?? '',
		},
		manifests: { pre: preManifestRef, post: postManifestRef },
	};

	const cases: P1bStatisticsCase[] = [];
	let domainsComplete = true;
	let sampleCountsExact = true;
	let reportsExist =
		preLoaded.exists &&
		postLoaded.exists &&
		comparisonLoaded.exists &&
		preManifestLoaded.exists &&
		postManifestLoaded.exists &&
		preReport !== null &&
		postReport !== null &&
		comparison !== null;

	const preDomains = reportCases(preReport)
		.map((testCase) => domainFor(testCase.domain))
		.filter((domain): domain is P1bDomain => domain !== null);
	const postDomains = reportCases(postReport)
		.map((testCase) => domainFor(testCase.domain))
		.filter((domain): domain is P1bDomain => domain !== null);
	const comparisonDomains = comparisonCases(comparison)
		.map(
			(testCase) => domainFor(testCase.domain) ?? domainFor(caseKey(testCase)),
		)
		.filter((domain): domain is P1bDomain => domain !== null);
	domainsComplete =
		reportCases(preReport).length === P1B_DOMAINS.length &&
		reportCases(postReport).length === P1B_DOMAINS.length &&
		comparisonCases(comparison).length === P1B_DOMAINS.length &&
		preDomains.length === P1B_DOMAINS.length &&
		postDomains.length === P1B_DOMAINS.length &&
		comparisonDomains.length === P1B_DOMAINS.length &&
		new Set(preDomains).size === P1B_DOMAINS.length &&
		new Set(postDomains).size === P1B_DOMAINS.length &&
		new Set(comparisonDomains).size === P1B_DOMAINS.length;

	for (const domain of P1B_DOMAINS) {
		const preCase = reportCaseFor(preReport, domain);
		const postCase = reportCaseFor(postReport, domain);
		const compareCase = comparisonCaseFor(comparison, domain);
		const paired = pairedContract(compareCase?.paired);
		const key = caseKey(compareCase ?? postCase ?? preCase) ?? domain;
		const baselineStatsRef: P1bStatisticsRef = {
			report: preReportRef,
			runId: stringValue(preReport?.runId) ?? '',
			caseId: stringValue(preCase?.id) ?? '',
			reportSha256: preLoaded.sha256,
			manifestRef: preManifestRef,
		};
		const currentStatsRef: P1bStatisticsRef = {
			report: postReportRef,
			runId: stringValue(postReport?.runId) ?? '',
			caseId: stringValue(postCase?.id) ?? '',
			reportSha256: postLoaded.sha256,
			manifestRef: postManifestRef,
		};
		const comparisonReference: P1bComparisonRef = {
			path: comparisonRef,
			sha256: comparisonLoaded.sha256,
			baseRunId: stringValue(comparison?.baseRunId) ?? '',
			currentRunId: stringValue(comparison?.currentRunId) ?? '',
		};
		cases.push({
			key,
			domain,
			baselineStatsRef,
			currentStatsRef,
			comparisonRef: comparisonReference,
			paired:
				paired ??
				({
					key,
					metric: 'p50Ms',
					unit: 'ms',
					pairedDeltasMs: [],
					medianRelativeImprovement: null,
					p95RelativeRegression: null,
					baselineSampleCount: 0,
					currentSampleCount: 0,
					positiveBaselineCount: 0,
					winCount: 0,
					lossCount: 0,
					tieCount: 0,
					excludedNonPositiveBaseline: 0,
					method: 'aggregate-fallback',
				} as PairedComparisonContract),
			ruleChecks: ruleChecksFor(domain, paired, postCase),
		});
		sampleCountsExact =
			sampleCountsExact &&
			samplesAreExact(preCase) &&
			samplesAreExact(postCase) &&
			checkManifestProtocol(preManifest) &&
			checkManifestProtocol(postManifest);
		reportsExist =
			reportsExist &&
			preCase !== undefined &&
			postCase !== undefined &&
			compareCase !== undefined &&
			paired !== null &&
			stringValue(preCase.id) !== null &&
			stringValue(postCase.id) !== null &&
			stringValue(preCase.domain) === domain &&
			stringValue(postCase.domain) === domain &&
			checkRefManifest(preManifest, preReport, preReportRef, preAnchor) &&
			checkRefManifest(postManifest, postReport, postReportRef, postAnchor) &&
			checkRuntime(preManifest, preReport) &&
			checkRuntime(postManifest, postReport) &&
			comparison?.baseRunId === preReport?.runId &&
			comparison?.currentRunId === postReport?.runId &&
			comparisonReference.baseRunId === preReport?.runId &&
			comparisonReference.currentRunId === postReport?.runId &&
			stringValue(paired?.key) === key &&
			sameJson(compareCase.paired, paired);
	}

	const lockfileHashesPresent =
		exactHex(preManifest?.lockfileHash, 64) &&
		exactHex(postManifest?.lockfileHash, 64) &&
		protocol.lockfileHashes.pre.length === 64 &&
		protocol.lockfileHashes.post.length === 64;
	reportsExist =
		reportsExist &&
		exactHex(preAnchor, 40) &&
		exactHex(postAnchor, 40) &&
		checkRuntime(preManifest, preReport) &&
		checkRuntime(postManifest, postReport) &&
		stringValue(preManifest?.report) !== null &&
		stringValue(postManifest?.report) !== null &&
		stringValue(preReport?.runId) !== null &&
		stringValue(postReport?.runId) !== null;

	const relativeImprovements = cases.map(
		(testCase) => testCase.paired.medianRelativeImprovement,
	);
	const nullRiCount = relativeImprovements.filter(
		(value) => value === null,
	).length;
	const floor =
		nullRiCount > 0
			? null
			: Math.min(
					...relativeImprovements.filter(
						(value): value is number => value !== null,
					),
				);
	const globalRuleChecks: P1bRuleCheck[] = [
		makeRule(
			'RI-non-null',
			'null RI count = 0',
			nullRiCount,
			nullRiCount === 0,
		),
		makeRule(
			'safety-floor',
			'min(RI) >= -0.10',
			floor,
			floor !== null && floor >= -0.1,
		),
	];
	const validity = {
		domainsComplete,
		sampleCountsExact,
		lockfileHashesPresent,
		reportsExist,
	};
	const valid = Object.values(validity).every(Boolean);
	const allRulesPass =
		globalRuleChecks.every((rule) => rule.pass) &&
		cases.every((testCase) => testCase.ruleChecks.every((rule) => rule.pass));
	return {
		schemaVersion: 1,
		anchors: { pre: preAnchor, post: postAnchor },
		protocol,
		cases,
		globalRuleChecks,
		validity,
		verdict: !valid ? 'invalid' : allRulesPass ? 'retained' : 'escalate',
	};
}

export function parseComposeArgs(argv: string[]): ComposeP1bOptions {
	let evidenceDir = '';
	let preReport = '';
	let postReport = '';
	let comparison = '';
	let out = '';
	let preManifest: string | undefined;
	let postManifest: string | undefined;
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const next = argv[index + 1];
		if (arg === '--help') {
			console.log(COMPOSE_USAGE);
			process.exit(0);
		}
		if (!next || !arg)
			throw new Error(`missing value for ${arg ?? 'argument'}`);
		switch (arg) {
			case '--evidence-dir':
				evidenceDir = next;
				break;
			case '--pre-report':
				preReport = next;
				break;
			case '--post-report':
				postReport = next;
				break;
			case '--comparison':
				comparison = next;
				break;
			case '--out':
				out = next;
				break;
			case '--pre-manifest':
				preManifest = next;
				break;
			case '--post-manifest':
				postManifest = next;
				break;
			default:
				throw new Error(`unknown argument: ${arg}`);
		}
		index += 1;
	}
	if (!evidenceDir || !preReport || !postReport || !comparison || !out) {
		throw new Error(
			'--evidence-dir, --pre-report, --post-report, --comparison, and --out are required',
		);
	}
	return {
		evidenceDir,
		preReport,
		postReport,
		comparison,
		out,
		preManifest,
		postManifest,
	};
}

export const COMPOSE_USAGE = `Usage: bun scripts/compose-p1b-statistics.ts
  --evidence-dir <dir>
  --pre-report <file>
  --post-report <file>
  --comparison <file>
  --out <file>
  [--pre-manifest <file>] [--post-manifest <file>]`;

async function main(): Promise<void> {
	const options = parseComposeArgs(process.argv.slice(2));
	const statistics = await composeP1bStatistics(options);
	const outputPath = path.resolve(options.evidenceDir, options.out);
	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await fs.writeFile(
		outputPath,
		`${JSON.stringify(statistics, null, 2)}\n`,
		'utf8',
	);
	console.log(`statistics.json: ${outputPath}`);
	console.log(`verdict: ${statistics.verdict}`);
	if (statistics.verdict === 'invalid') process.exitCode = 1;
}

if (import.meta.main) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 2;
	});
}
