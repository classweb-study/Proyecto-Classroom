import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from './index.js';

// Migrations require a session-capable connection. Application traffic keeps
// using DATABASE_URL (the pooled Neon URL), while migrations use the direct
// connection Neon provides alongside it.
const database = createDatabase(
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
);

try {
  await migrate(database.db, {
    migrationsFolder: 'packages/database/product/migrations',
  });

  console.log('Product database migrations applied successfully.');
} catch {
  console.error('Product database migration failed.');
  process.exitCode = 1;
} finally {
  await database.close();
}
