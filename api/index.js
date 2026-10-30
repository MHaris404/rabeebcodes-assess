import { createApp } from '../server/src/app.js';
import { db } from '../server/src/lib/database.js';

// Vercel owns the HTTP listener and process lifecycle. Reuse the same API and
// warm-instance database pool without starting the standalone Node server.
export default createApp({ db });
