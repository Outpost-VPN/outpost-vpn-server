export const migrations = [
  {
    version: 1,
    name: "initial",
    sql: `
      PRAGMA foreign_keys = ON;

      CREATE TABLE owners (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        timezone TEXT NOT NULL DEFAULT 'Europe/Moscow',
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

      CREATE TABLE people (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT 'blue',
        avatar TEXT NOT NULL DEFAULT 'avatar-current',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT
      );

      CREATE TABLE devices (
        id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
        name TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'other',
        platform TEXT NOT NULL DEFAULT 'unknown',
        client TEXT NOT NULL DEFAULT 'incy',
        status TEXT NOT NULL DEFAULT 'invited',
        subscription_token_hash TEXT UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        activated_at TEXT,
        first_seen_at TEXT,
        last_seen_at TEXT,
        profile_fetched_at TEXT,
        last_routes_version INTEGER,
        absence_notified_at TEXT,
        revoked_at TEXT
      );

      CREATE TABLE credentials (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        engine TEXT NOT NULL,
        ciphertext TEXT NOT NULL,
        iv TEXT NOT NULL,
        tag TEXT NOT NULL,
        created_at TEXT NOT NULL,
        revoked_at TEXT,
        UNIQUE(device_id, engine)
      );

      CREATE TABLE invitations (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'pending',
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        redeemed_at TEXT
      );

      CREATE TABLE redemption_sessions (
        id TEXT PRIMARY KEY,
        invitation_id TEXT NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
        device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

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
        actor TEXT NOT NULL
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
        device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        engine TEXT NOT NULL,
        upload INTEGER NOT NULL DEFAULT 0,
        download INTEGER NOT NULL DEFAULT 0,
        observed_at TEXT NOT NULL,
        PRIMARY KEY(device_id, engine)
      );

      CREATE TABLE traffic_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bucket TEXT NOT NULL,
        bucket_at TEXT NOT NULL,
        person_id TEXT NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
        device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
        engine TEXT NOT NULL,
        upload INTEGER NOT NULL,
        download INTEGER NOT NULL,
        UNIQUE(bucket, bucket_at, device_id, engine)
      );

      CREATE INDEX traffic_samples_period ON traffic_samples(bucket, bucket_at);
      CREATE INDEX traffic_samples_person ON traffic_samples(person_id, bucket_at);

      CREATE TABLE device_presence (
        device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        engine TEXT NOT NULL CHECK(engine IN ('hysteria', 'xray')),
        status TEXT NOT NULL CHECK(status IN ('online', 'offline', 'unknown')),
        signal TEXT NOT NULL CHECK(signal IN ('connections', 'traffic')),
        connections INTEGER,
        misses INTEGER NOT NULL DEFAULT 0,
        last_active_at TEXT,
        observed_at TEXT NOT NULL,
        changed_at TEXT NOT NULL,
        PRIMARY KEY(device_id, engine)
      );

      CREATE INDEX device_presence_status ON device_presence(status, observed_at DESC);

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

      CREATE TABLE events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('people', 'routes', 'engines', 'maintenance', 'security', 'system')),
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
  {
    version: 2,
    name: "device-sync-outbox",
    sql: `
      CREATE TABLE device_sync_jobs (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        invitation_id TEXT REFERENCES invitations(id) ON DELETE SET NULL,
        kind TEXT NOT NULL CHECK(kind IN ('activate', 'revoke')),
        status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'failed', 'completed')),
        actor TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT NOT NULL,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE UNIQUE INDEX device_sync_jobs_open
        ON device_sync_jobs(device_id, kind)
        WHERE status IN ('pending', 'running', 'failed');
      CREATE INDEX device_sync_jobs_due
        ON device_sync_jobs(status, next_attempt_at, created_at);
    `,
  },
] as const;

export const defaultRoutes = [
  { action: "DIRECT", matcher: "IP_CIDR", value: "10.0.0.0/8", source: "system", locked: true },
  { action: "DIRECT", matcher: "IP_CIDR", value: "172.16.0.0/12", source: "system", locked: true },
  { action: "DIRECT", matcher: "IP_CIDR", value: "192.168.0.0/16", source: "system", locked: true },
  { action: "PROXY", matcher: "SUFFIX", value: "*", source: "system", locked: true },
] as const;
