import type { Db } from "./db";
export async function initBE03Schema(_db: Db): Promise<void> {
	// no-op: real schema setup happens in the backend project
	return;
}

export default initBE03Schema;
