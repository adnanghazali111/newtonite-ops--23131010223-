import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Override only the database path so credentials such as the `newtonite`
// username are never rewritten when DATABASE_URL is already configured.
const databaseUrl = new URL(
  process.env.DATABASE_URL || 'postgresql://newtonite:newtonite_dev_only@localhost:5432/newtonite',
);
databaseUrl.pathname = '/newtonite_test';
process.env.DATABASE_URL = databaseUrl.toString();
