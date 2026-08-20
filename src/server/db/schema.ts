export const migrations = [
  {
    version: 1,
    name: "initial",
    sql: `
      PRAGMA foreign_keys = ON;

      CREATE TABLE owners (
        id TEXT PRIMARY KEY,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE passkeys (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
        public_key BLOB NOT NULL,
        counter INTEGER NOT NULL DEFAULT 0,
        transports_json TEXT NOT NULL DEFAULT '[]',
        device_type TEXT,
        backed_up INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        last_used_at TEXT
      );

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        user_agent TEXT
      );

      CREATE TABLE api_tokens (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        scopes_json TEXT NOT NULL,
        expires_at TEXT,
        created_at TEXT NOT NULL,
        last_used_at TEXT,
        revoked_at TEXT
      );

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE connections (
        id TEXT PRIMARY KEY,
        serial INTEGER NOT NULL UNIQUE,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT 'blue',
        avatar TEXT NOT NULL DEFAULT 'avatar-person',
        status TEXT NOT NULL CHECK(status IN ('provisioning', 'active', 'rotating', 'archiving', 'archived')),
        generation INTEGER NOT NULL DEFAULT 1,
        subscription_token_hash TEXT UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        activated_at TEXT,
        first_used_at TEXT,
        last_fetched_at TEXT,
        first_seen_at TEXT,
        last_seen_at TEXT,
        absence_notified_at TEXT,
        archived_at TEXT
      );

      CREATE INDEX connections_status ON connections(status, created_at);

      CREATE TABLE credentials (
        id TEXT PRIMARY KEY,
        connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
        generation INTEGER NOT NULL,
        engine TEXT NOT NULL CHECK(engine IN ('hysteria', 'xray')),
        state TEXT NOT NULL CHECK(state IN ('pending', 'active', 'revoked')),
        ciphertext TEXT NOT NULL,
        iv TEXT NOT NULL,
        tag TEXT NOT NULL,
        created_at TEXT NOT NULL,
        activated_at TEXT,
        revoked_at TEXT,
        UNIQUE(connection_id, generation, engine)
      );

      CREATE UNIQUE INDEX credentials_active
        ON credentials(connection_id, engine)
        WHERE state = 'active';

      CREATE TABLE connection_sync_jobs (
        id TEXT PRIMARY KEY,
        connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
        generation INTEGER NOT NULL,
        previous_generation INTEGER,
        kind TEXT NOT NULL CHECK(kind IN ('activate', 'rotate', 'revoke')),
        status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'failed', 'completed', 'cancelled')),
        actor TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT NOT NULL,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE UNIQUE INDEX connection_sync_jobs_open
        ON connection_sync_jobs(connection_id)
        WHERE status IN ('pending', 'running', 'failed');
      CREATE INDEX connection_sync_jobs_due
        ON connection_sync_jobs(status, next_attempt_at, created_at);

      CREATE TABLE route_drafts (
        id TEXT PRIMARY KEY,
        position INTEGER NOT NULL,
        action TEXT NOT NULL CHECK(action IN ('DIRECT', 'PROXY', 'BLOCK')),
        matcher TEXT NOT NULL CHECK(matcher IN ('DOMAIN', 'SUFFIX', 'IP_CIDR', 'GEOSITE', 'GEOIP')),
        value TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'user',
        locked INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX route_drafts_position ON route_drafts(position);

      CREATE TABLE route_revisions (
        id TEXT PRIMARY KEY,
        version INTEGER NOT NULL UNIQUE,
        rules_json TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        actor TEXT NOT NULL,
        ruleset_version TEXT
      );

      CREATE TABLE engine_configs (
        id TEXT PRIMARY KEY,
        engine TEXT NOT NULL,
        version INTEGER NOT NULL,
        preset_version INTEGER NOT NULL DEFAULT 1,
        template TEXT NOT NULL,
        rendered_hash TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        UNIQUE(engine, version)
      );

      CREATE TABLE engine_versions (
        engine TEXT PRIMARY KEY,
        installed_version TEXT,
        desired_version TEXT NOT NULL,
        checksum TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE traffic_cursors (
        connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
        engine TEXT NOT NULL,
        upload INTEGER NOT NULL DEFAULT 0,
        download INTEGER NOT NULL DEFAULT 0,
        observed_at TEXT NOT NULL,
        PRIMARY KEY(connection_id, engine)
      );

      CREATE TABLE traffic_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bucket TEXT NOT NULL,
        bucket_at TEXT NOT NULL,
        connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
        engine TEXT NOT NULL,
        upload INTEGER NOT NULL,
        download INTEGER NOT NULL,
        UNIQUE(bucket, bucket_at, connection_id, engine)
      );

      CREATE INDEX traffic_samples_period ON traffic_samples(bucket, bucket_at);
      CREATE INDEX traffic_samples_connection ON traffic_samples(connection_id, bucket_at);

      CREATE TABLE connection_presence (
        connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
        engine TEXT NOT NULL CHECK(engine IN ('hysteria', 'xray')),
        status TEXT NOT NULL CHECK(status IN ('online', 'offline', 'unknown')),
        signal TEXT NOT NULL CHECK(signal IN ('connections', 'traffic')),
        connections INTEGER,
        misses INTEGER NOT NULL DEFAULT 0,
        last_active_at TEXT,
        observed_at TEXT NOT NULL,
        changed_at TEXT NOT NULL,
        PRIMARY KEY(connection_id, engine)
      );

      CREATE INDEX connection_presence_status ON connection_presence(status, observed_at DESC);

      CREATE TABLE operations (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        progress INTEGER NOT NULL DEFAULT 0,
        message TEXT NOT NULL DEFAULT '',
        result_json TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE confirmations (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        preview_json TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        resource TEXT NOT NULL,
        resource_id TEXT,
        before_json TEXT,
        after_json TEXT,
        ip TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('connections', 'routes', 'engines', 'maintenance', 'security', 'system')),
        kind TEXT NOT NULL CHECK(kind IN ('change', 'activity', 'incident')),
        severity TEXT NOT NULL CHECK(severity IN ('info', 'warning', 'error', 'critical')),
        outcome TEXT CHECK(outcome IN ('started', 'succeeded', 'failed', 'recovered') OR outcome IS NULL),
        important INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL,
        actor TEXT,
        subject_type TEXT,
        subject_id TEXT,
        operation_id TEXT REFERENCES operations(id) ON DELETE SET NULL,
        audit_id INTEGER REFERENCES audit_log(id) ON DELETE SET NULL,
        data_json TEXT NOT NULL DEFAULT '{}',
        occurred_at TEXT NOT NULL
      );

      CREATE INDEX events_occurred_at ON events(occurred_at DESC, id DESC);
      CREATE INDEX events_category ON events(category, occurred_at DESC, id DESC);
      CREATE INDEX events_severity ON events(severity, occurred_at DESC, id DESC);
      CREATE INDEX events_kind ON events(kind, occurred_at DESC, id DESC);
      CREATE INDEX events_subject ON events(subject_type, subject_id, occurred_at DESC, id DESC);

      CREATE TABLE monitor_states (
        key TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        severity TEXT,
        failures INTEGER NOT NULL DEFAULT 0,
        data_json TEXT NOT NULL DEFAULT '{}',
        observed_at TEXT NOT NULL,
        changed_at TEXT NOT NULL
      );

      CREATE TABLE webauthn_challenges (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        challenge TEXT NOT NULL,
        context_json TEXT NOT NULL DEFAULT '{}',
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `,
  },
] as const;

export const defaultRoutes = [
  { action: "DIRECT", matcher: "IP_CIDR", value: "10.0.0.0/8", source: "system", locked: true },
  { action: "DIRECT", matcher: "IP_CIDR", value: "172.16.0.0/12", source: "system", locked: true },
  { action: "DIRECT", matcher: "IP_CIDR", value: "192.168.0.0/16", source: "system", locked: true },
  { action: "PROXY", matcher: "SUFFIX", value: "*", source: "system", locked: true },
] as const;
