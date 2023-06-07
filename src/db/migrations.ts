import { Kysely, Migration, MigrationProvider } from 'kysely'

const migrations: Record<string, Migration> = {}

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations
  },
}

migrations['001'] = {
  async up(db: Kysely<unknown>) {
    console.log("1")
    await db.schema
      .createTable('post')
      .addColumn('uri', 'varchar', (col) => col.primaryKey())
      .addColumn('cid', 'varchar', (col) => col.notNull())
      .addColumn('replyParent', 'varchar')
      .addColumn('replyRoot', 'varchar')
      .addColumn('indexedAt', 'varchar', (col) => col.notNull())
      .execute()
    await db.schema
      .createTable('sub_state')
      .addColumn('service', 'varchar', (col) => col.primaryKey())
      .addColumn('cursor', 'integer', (col) => col.notNull())
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable('post').execute()
    await db.schema.dropTable('sub_state').execute()
  },
}

migrations['002'] = {
  async up(db: Kysely<unknown>) {
    console.log("2")
    await db.schema
      .createTable('gptfeed_user')
      .addColumn('uri', 'varchar', (col) => col.primaryKey())
      .addColumn('description', 'text')
      .addColumn('descriptionIndexed', 'text')
      .addColumn('keywords', 'varchar')
      .execute()
    await db.schema
      .createTable('gptfeed_post')
      .addColumn('uri', 'varchar', (col) => col.primaryKey())
      .addColumn('cid', 'varchar', (col) => col.notNull())
      .addColumn('feedUser', 'integer', (col) => col.references("gptfeed_user.uri"))
      .addColumn('indexedAt', 'varchar', (col) => col.notNull())
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable('gptfeed_user').execute()
    await db.schema.dropTable('gptfeed_post').execute()
  },
}
