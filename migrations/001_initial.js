exports.up = function(knex) {
  return knex.schema
    .createTable('users', table => {
      table.uuid('id').primary().defaultTo(knex.fn.uuid());
      table.string('username', 100).notNullable().unique();
      table.string('email', 255).notNullable().unique();
      table.string('password_hash', 255).notNullable();
      table.string('display_name', 200).defaultTo('');
      table.boolean('is_active').defaultTo(true);
      table.timestamps(true, true);
    })
    .createTable('user_roles', table => {
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('role', 50).notNullable();
      table.primary(['user_id', 'role']);
    })
    .createTable('user_sessions', table => {
      table.uuid('id').primary().defaultTo(knex.fn.uuid());
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('token_hash', 255).notNullable();
      table.string('ip_address', 45).defaultTo('');
      table.string('user_agent', 500).defaultTo('');
      table.timestamp('expires_at').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    })
    .createTable('five9_credentials', table => {
      table.uuid('id').primary().defaultTo(knex.fn.uuid());
      table.string('label', 200).notNullable();
      table.string('soap_username', 200).defaultTo('');
      table.text('soap_password').defaultTo('');
      table.string('soap_data_center', 50).defaultTo('US');
      table.string('soap_api_version', 20).defaultTo('v13');
      table.string('rest_username', 200).defaultTo('');
      table.text('rest_password').defaultTo('');
      table.string('rest_data_center', 50).defaultTo('US');
      table.boolean('is_active').defaultTo(true);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    })
    .createTable('audit_logs', table => {
      table.uuid('id').primary().defaultTo(knex.fn.uuid());
      table.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.string('action', 100).notNullable();
      table.string('entity_type', 100).notNullable();
      table.string('entity_id', 100).defaultTo('');
      table.jsonb('details').defaultTo('{}');
      table.string('ip_address', 45).defaultTo('');
      table.timestamp('created_at').defaultTo(knex.fn.now());
    })
    .raw('CREATE INDEX idx_user_roles_user ON user_roles(user_id)');
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('audit_logs')
    .dropTableIfExists('five9_credentials')
    .dropTableIfExists('user_sessions')
    .dropTableIfExists('user_roles')
    .dropTableIfExists('users');
};
