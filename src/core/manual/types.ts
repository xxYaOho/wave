export interface ManualSiteConfig {
	title: string;
	description: string;
	basePath: string;
}

export interface ManualHomeCardConfig {
	title: string;
	description: string;
	href: string;
	command: string;
}

export interface ManualNavPageConfig {
	title: string;
	href: string;
	source: string;
}

export interface ManualNavSectionConfig {
	title: string;
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

export interface LoadedManual {
	site: ManualSiteConfig;
	home: {
		cards: ManualHomeCardConfig[];
	};
	sections: ManualSection[];
	pages: ManualPage[];
}

export interface ManualDataPage extends ManualPage {
	html: string;
	searchText: string;
}

export interface ManualDataSection {
	title: string;
	pages: ManualDataPage[];
}

export interface ManualData {
	site: ManualSiteConfig;
	home: {
		cards: ManualHomeCardConfig[];
	};
	sections: ManualDataSection[];
	pages: ManualDataPage[];
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
