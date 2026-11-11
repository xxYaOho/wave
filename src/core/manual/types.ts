export type Locale = 'zh' | 'en';

export interface ManualSiteConfig {
	title: string;
	titleEn?: string;
	description: string;
	descriptionEn?: string;
	basePath: string;
}

export interface ManualHomeCardConfig {
	title: string;
	titleEn?: string;
	description: string;
	descriptionEn?: string;
	href: string;
	command: string;
}

export interface ManualNavPageConfig {
	title: string;
	titleEn?: string;
	href: string;
	source: string;
	sourceEn?: string;
}

export interface ManualNavSectionConfig {
	title: string;
	titleEn?: string;
	pages: ManualNavPageConfig[];
}

export interface ManualConfig {
	site: ManualSiteConfig;
	home: {
		cards: ManualHomeCardConfig[];
	};
	nav: ManualNavSectionConfig[];
}

export interface ManualPageFrontmatter {
	title: string;
	description: string;
	category: string;
	commands: string[];
	appliesTo: string[];
}

export interface ManualPage extends ManualPageFrontmatter {
	href: string;
	source: string;
	body: string;
}

export interface ManualSection {
	title: string;
	pages: ManualPage[];
}

/** A complete manual view for one locale. */
export interface ManualView {
	site: {
		title: string;
		description: string;
		basePath: string;
	};
	home: {
		cards: Array<{
			title: string;
			description: string;
			href: string;
			command: string;
		}>;
	};
	sections: Array<{
		title: string;
		pages: ManualPage[];
	}>;
	nav: Array<{
		title: string;
		pages: ManualPage[];
	}>;
	pages: ManualPage[];
}

/** The loader keeps the historical Chinese view while exposing both locale views when requested. */
export interface LoadedManual extends ManualView {
	locales: Record<Locale, ManualView>;
}

export interface ManualDataPage extends ManualPage {
	html: string;
	searchText: string;
}

export interface ManualDataSection {
	title: string;
	pages: ManualDataPage[];
}

export interface ManualDataView {
	site: ManualView['site'];
	home: ManualView['home'];
	sections: Array<{
		title: string;
		pages: ManualDataPage[];
	}>;
	nav: Array<{
		title: string;
		pages: ManualDataPage[];
	}>;
	pages: ManualDataPage[];
}

export interface ManualData {
	/** English aliases preserve the pre-bilingual consumer contract during migration. */
	site: ManualDataView['site'];
	home: ManualDataView['home'];
	sections: ManualDataView['sections'];
	pages: ManualDataView['pages'];
	nav?: ManualDataView['nav'];
	locales?: Record<Locale, ManualDataView>;
}

export interface LoadManualOptions {
	rootDir?: string;
	configPath?: string;
}

export class ManualLoadError extends Error {
	constructor(
		message: string,
		public readonly path?: string,
	) {
		super(path ? `${message}: ${path}` : message);
		this.name = 'ManualLoadError';
	}
}
