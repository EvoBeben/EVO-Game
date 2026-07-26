/** Drops the SQLite file and reapplies the schema. */

import { closeDb, databasePath, resetDb } from '../lib/db';

resetDb();
console.log(`Reset ${databasePath()}`);
closeDb();
