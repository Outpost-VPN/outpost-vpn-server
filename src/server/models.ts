export type RouteAction = "DIRECT" | "PROXY" | "BLOCK";
export type RouteMatcher = "DOMAIN" | "SUFFIX" | "IP_CIDR" | "GEOSITE" | "GEOIP";
export type ClientKind = "incy" | "mihomo";
export type EngineId = "hysteria" | "xray";
export type DeviceStatus = "invited" | "active" | "revoked";
export type DeviceKind = "phone" | "tablet" | "computer" | "vr" | "television" | "other";
export type PresenceStatus = "online" | "offline" | "unknown";
export type JournalCategory = "people" | "routes" | "engines" | "maintenance" | "security" | "system";
export type JournalKind = "change" | "activity" | "incident";
export type JournalSeverity = "info" | "warning" | "error" | "critical";
export type JournalOutcome = "started" | "succeeded" | "failed" | "recovered" | null;

export interface EnginePresence {
  status: PresenceStatus;
  signal: "connections" | "traffic";
  connections?: number | null;
  last_active_at?: string | null;
  observed_at: string;
  changed_at: string;
}

export interface DevicePresence {
  status: PresenceStatus;
  first_seen_at: string | null;
  last_seen_at: string | null;
  changed_at: string | null;
  engines: Partial<Record<EngineId, EnginePresence>>;
}

export interface JournalEventInput {
  type: string;
  category: JournalCategory;
  kind: JournalKind;
  severity?: JournalSeverity;
  outcome?: JournalOutcome;
  important?: boolean;
  source: string;
  actor?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  operationId?: string | null;
  auditId?: number | null;
  data?: Record<string, unknown>;
  occurredAt?: string;
}

export interface Person {
  id: string;
  name: string;
  note: string;
  color: string;
  avatar: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface Device {
  id: string;
  person_id: string;
  person_name?: string;
  name: string;
  kind: DeviceKind;
  platform: string;
  client: ClientKind;
  status: DeviceStatus;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  profile_fetched_at: string | null;
  last_routes_version: number | null;
  absence_notified_at: string | null;
  presence?: DevicePresence;
  revoked_at: string | null;
}

export interface RouteRule {
  id: string;
  position: number;
  action: RouteAction;
  matcher: RouteMatcher;
  value: string;
  source: "system" | "preset" | "user";
  locked: number | boolean;
  enabled: number | boolean;
  created_at: string;
  updated_at: string;
}

export interface DeviceCredential {
  deviceId: string;
  hysteria: {
    id: string;
    password: string;
  };
  xray: {
    id: string;
    email: string;
  };
}

export interface TrafficPoint {
  deviceId: string;
  upload: number;
  download: number;
}
