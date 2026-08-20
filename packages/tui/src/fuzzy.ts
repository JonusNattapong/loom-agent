import Fuse from "fuse.js";

export interface FuzzyMatch {
	matches: boolean;
	score: number;
	indices?: readonly [number, number][];
}

export function fuzzyMatch(query: string, text: string): FuzzyMatch {
	if (!query.trim()) {
		return { matches: true, score: 0 };
	}

	const fuse = new Fuse([text], {
		includeScore: true,
		includeMatches: true,
		threshold: 0.5,
	});

	const results = fuse.search(query);
	if (results.length === 0 || !results[0]) {
		return { matches: false, score: 100 };
	}

	const res = results[0];
	const score = (res.score ?? 0) * 100;
	const indices = res.matches?.[0]?.indices as readonly [number, number][] | undefined;
	return { matches: true, score, indices };
}

export interface ScoredItem<T> {
	item: T;
	score: number;
	matches?: readonly any[];
}

/**
 * Filter items by fuzzy match quality using Fuse.js, returning each match with its score
 * (lower is better) sorted best-first.
 */
export function fuzzyFilterScored<T>(items: T[], query: string, getText: (item: T) => string): ScoredItem<T>[] {
	if (!query.trim()) {
		return items.map((item) => ({ item, score: 0 }));
	}

	const wrapped = items.map((item) => ({
		item,
		text: getText(item),
	}));

	const fuse = new Fuse(wrapped, {
		keys: ["text"],
		includeScore: true,
		includeMatches: true,
		threshold: 0.5,
	});

	const results = fuse.search(query);
	return results.map((r) => ({
		item: r.item.item,
		score: (r.score ?? 0) * 100,
		matches: r.matches,
	}));
}

/**
 * Filter and sort items by Fuse.js fuzzy match quality (best matches first).
 */
export function fuzzyFilter<T>(items: T[], query: string, getText: (item: T) => string): T[] {
	if (!query.trim()) {
		return items;
	}
	return fuzzyFilterScored(items, query, getText).map((r) => r.item);
}
