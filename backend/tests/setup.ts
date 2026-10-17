import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Override DATABASE_URL to use test database
process.env.DATABASE_URL = process.env.DATABASE_URL?.replace('/newtonite', '/newtonite_test')
  || 'postgresql://newtonite:newtonite_dev_only@localhost:5432/newtonite_test';
