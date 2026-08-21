export type DashboardReason = "traffic" | "monitoring" | "mutation" | "connections" | "operations" | "rulesets";

export type DashboardSnapshotEvent = {
  revision: number;
  reason: DashboardReason;
  at: string;
};

type Listener = (event: DashboardSnapshotEvent) => void;

export class DashboardEvents {
  private current = 0;
  private listeners = new Set<Listener>();

  get revision() {
    return this.current;
  }

  get subscriberCount() {
    return this.listeners.size;
  }

  publish(reason: DashboardReason) {
    const event = { revision: ++this.current, reason, at: new Date().toISOString() };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        this.listeners.delete(listener);
      }
    }
    return event;
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
