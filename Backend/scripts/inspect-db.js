import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

async function main() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  const pool = new Pool({ connectionString });

  try {
    const dbInfo = await pool.query(
      'SELECT current_database(), current_user, version(), now()'
    );
    console.log('--- DATABASE CONNECTION ---');
    console.log('Database:', dbInfo.rows[0].current_database);
    console.log('User:', dbInfo.rows[0].current_user);
    console.log('PostgreSQL Version:', dbInfo.rows[0].version.split(',')[0]);
    console.log('Timestamp:', dbInfo.rows[0].now);

    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log('\n--- PUBLIC TABLES ---');
    console.log('Total Tables Count:', tables.rows.length);
    console.log(tables.rows.map((r) => r.table_name));

    const enums = await pool.query(`
      SELECT t.typname as enum_name, array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      GROUP BY t.typname
      ORDER BY t.typname;
    `);
    console.log('\n--- ENUMS COUNT ---', enums.rows.length);

    const migrations = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
      ) as has_migrations_table;
    `);
    console.log('\n--- MIGRATIONS TABLE ---');
    console.log(
      'Has _prisma_migrations:',
      migrations.rows[0].has_migrations_table
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Database inspection failed:', err.message);
  process.exit(1);
});
