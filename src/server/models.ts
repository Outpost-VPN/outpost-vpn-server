export type RouteAction = "DIRECT" | "PROXY" | "BLOCK";
export type RouteMatcher = "DOMAIN" | "SUFFIX" | "IP_CIDR" | "GEOSITE" | "GEOIP";
export type SubscriptionFormat = "mihomo" | "sing-box" | "xray" | "xray-json" | "links";
export type EngineId = "hysteria" | "xray";
export type ConnectionStatus = "provisioning" | "active" | "rotating" | "archiving" | "archived";
export type PresenceStatus = "online" | "offline" | "unknown";
export type JournalCategory = "connections" | "routes" | "engines" | "maintenance" | "security" | "system";
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

export interface ConnectionPresence {
  status: PresenceStatus;
  first_seen_at: string | null;
  last_seen_at: string | null;
  changed_at: string | null;
  engines: Partial<Record<EngineId, EnginePresence>>;
}

export interface Connection {
  id: string;
  serial: number;
  name: string;
  color: string;
  avatar: string;
  status: ConnectionStatus;
  generation: number;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
  first_used_at: string | null;
  last_fetched_at: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  absence_notified_at: string | null;
  archived_at: string | null;
  presence?: ConnectionPresence;
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

export interface ConnectionCredential {
  connectionId: string;
  generation: number;
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
  connectionId: string;
  upload: number;
  download: number;
}
