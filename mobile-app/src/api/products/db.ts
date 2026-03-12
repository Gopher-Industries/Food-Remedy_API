// Minimal DB wrapper exports used by bootstrap.ts.
// This file provides lightweight stubs so the mobile app can build.

export type Db = any;

// `db` is expected to be an object used by other code paths. Provide
// a minimal in-memory stub that can be replaced by a real implementation.
export const db = {
	// placeholder methods used by schema initializers; these no-op or return promises
	run: async (..._args: any[]) => {},
	exec: async (..._args: any[]) => {},
	getAll: async (_sql: string) => [],
};

export default db;
