const read = [
  "status:read", "traffic:read", "connections:read", "routes:read",
  "operations:read", "system:read", "settings:read", "engines:read",
] as const;

const manage = [
  ...read, "connections:write", "connections:secret", "connections:rotate",
  "routes:write", "operations:write", "settings:write", "engines:write",
] as const;

export const tokenScopes = {read, manage};
export const allowedApiScopes: ReadonlySet<string> = new Set([...manage, "backups:read"]);
