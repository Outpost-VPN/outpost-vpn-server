import {parseDiagnosticRequest, diagnosticReportSchema, type DiagnosticRequest, type DiagnosticProfile, type DiagnosticReport, type DiagnosticStage} from "../../shared/diagnostics";
import {runProbes} from "../../diagnostics/probes";
import type {OutpostDatabase} from "../db/database";
import {OperationService} from "./operations";
import {ConnectionService, ServiceError} from "./connections";
import {ResourceService, summarizeResources, type ResourceSample} from "./resources";
import {config} from "../config";
import {mihomoOutbound, singBoxOutbound} from "../adapters/method-outbounds";
import type {SubscriptionContext} from "../adapters/subscriptions";
import {createToken, hashToken, tokensEqual} from "../security";

type ClientJob = {actor: string; request: DiagnosticRequest; claimed: boolean; expiresAt: number; tokenHash?: string;
  resolve?: (report: DiagnosticReport) => void; progress?: () => void; report?: DiagnosticReport; complete?: boolean};

export class DiagnosticService {
  private clients = new Map<string, ClientJob>();
  constructor(private db: OutpostDatabase, private operations: OperationService, private resources: ResourceService,
    private connections: ConnectionService, private probe = runProbes) {}

  run(input: unknown, actor: string) {
    if (this.db.raw.query<{count: number}, []>("SELECT COUNT(*) AS count FROM operations WHERE kind='diagnostic' AND status IN ('queued','running')").get()!.count >= 1)
      throw new ServiceError(409, "A diagnostic is already running; read or cancel it first");
    let request = parseDiagnosticRequest(input);
    for (const value of [request.target, request.uploadTarget]) {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) throw new ServiceError(400, "Only HTTP(S) targets without credentials or fragment are supported");
    }
    if (request.connectionId) {
      const connection = this.connections.get(request.connectionId);
      if (connection.status !== "active" || connection.suspended_at) throw new ServiceError(409, "The diagnostic connection must be active");
    }
    if (request.kind === "compare" || request.kind === "transport-speed" || request.methodIds.length) {
      const methods = this.db.methods.list().filter(method => method.enabled && this.db.engines.has(method.engine));
      if (request.kind === "transport-speed" && !request.methodIds.length) request.methodIds = methods.filter(method => method.engine === "hysteria" && method.protocol === "hysteria2").map(method => method.id);
      else if (request.kind === "compare" && !request.methodIds.length) request.methodIds = methods.map(method => method.id);
      if (!request.methodIds.length || request.methodIds.some(id => !methods.some(method => method.id === id && (request.kind !== "transport-speed" || method.engine === "hysteria" && method.protocol === "hysteria2"))))
        throw new ServiceError(400, "Select enabled, installed methods compatible with this diagnostic");
      if (new Set(request.methodIds).size !== request.methodIds.length) throw new ServiceError(400, "Duplicate diagnostic methods");
      request = parseDiagnosticRequest(request);
    }
    let id = "";
    const operation = this.operations.runDiagnostic(request, actor, (signal, report) => this.execute(id, request, signal, report));
    id = operation.id;
    if (request.vantage === "client") this.clients.set(id, {actor, request, claimed: false, expiresAt: Date.now() + 300_000});
    return {...operation, ...(request.vantage === "client" ? {runner: {command: `outpostctl diagnose --operation ${id} --interface <physical-interface>`, claimExpiresAt: this.clients.get(id)!.expiresAt}} : {})};
  }

  get(id: string, includeSamples = false) {
    const operation = this.operations.get(id, includeSamples);
    if (operation.kind !== "diagnostic") throw new ServiceError(404, "Diagnostic not found");
    return operation;
  }

  cancel(id: string, actor: string) {this.get(id); const result = this.operations.cancelDiagnostic(id, actor); this.clients.delete(id); return result;}

  claim(id: string, actor: string) {
    const job = this.clients.get(id);
    if (!job || job.actor !== actor || job.claimed || job.expiresAt < Date.now() || this.get(id).status !== "running") throw new ServiceError(409, "Client diagnostic is not claimable");
    const profiles = this.profiles(job.request);
    const token = createToken();
    job.claimed = true; job.tokenHash = hashToken(token);
    return {request: job.request, profiles, reportToken: token, expiresAt: job.expiresAt + 300_000};
  }

  report(id: string, actor: string, token: string, value: unknown, complete = true) {
    const job = this.clients.get(id);
    if (!job || job.actor !== actor || !job.tokenHash || !tokensEqual(token, job.tokenHash) || this.get(id).status !== "running") throw new ServiceError(409, "Client diagnostic report rejected");
    const report = diagnosticReportSchema.parse(value);
    if (report.runner.finishedAt < report.runner.startedAt || report.runner.finishedAt - report.runner.startedAt > 300_000) throw new ServiceError(400, "Invalid runner interval");
    if (report.stages.some(stage => stage.methodId && !job.request.methodIds.includes(stage.methodId) && !(stage.methodId === "direct" && (job.request.kind === "compare" || !job.request.methodIds.length)))) throw new ServiceError(400, "Unexpected diagnostic method");
    const expected = [...job.request.methodIds, ...(job.request.kind === "compare" || !job.request.methodIds.length ? ["direct"] : [])];
    if (complete && expected.some(id => !report.stages.some(stage => stage.methodId === id))) throw new ServiceError(400, "Incomplete diagnostic report");
    if (report.stages.some(stage => ["bytes", "downloadBytes", "uploadBytes"].some(key => typeof stage.metrics[key] === "number" && (stage.metrics[key] as number) > job.request.byteLimit))) throw new ServiceError(400, "Transfer exceeded the diagnostic byte limit");
    job.report = report; job.complete = complete; job.progress?.();
    if (complete) {job.resolve?.(report); job.tokenHash = undefined;}
    return {accepted: true};
  }

  private async execute(id: string, request: DiagnosticRequest, cancelled: AbortSignal, report: (result: unknown, progress?: number) => void) {
    const startedAt = Date.now(), samples: ResourceSample[] = [], stages: DiagnosticStage[] = [];
    const signal = AbortSignal.any([cancelled, AbortSignal.timeout(request.vantage === "client" ? 600_000 : 240_000)]);
    let sampling = false;
    const sample = async () => {
      if (sampling || samples.length >= 120) return;
      sampling = true;
      try {await this.resources.sample(); const snapshot = this.resources.current().snapshot; if (snapshot) samples.push(snapshot);} finally {sampling = false;}
    };
    const state = () => ({request, startedAt, sampledAt: Date.now(), stages: this.clients.get(id)?.report?.stages ?? [...stages], resources: [...samples], resourceSummary: summarizeResources(samples),
      measurementPath: request.vantage === "server" ? "server-to-origin" : request.kind === "transport-speed" ? "client-to-vpn-server" : request.methodIds.length ? "client-via-vpn-to-origin" : "client-to-origin",
      observedFrom: request.vantage, quicLossPercent: null, ...(request.vantage === "client" ? {clientEvidence: "reported-by-authorized-runner"} : {})});
    const client = this.clients.get(id);
    if (client) client.progress = () => report(state());
    await sample();
    const timer = setInterval(() => {
      if (request.vantage === "client" && !this.clients.get(id)?.claimed) return;
      void sample().then(() => report(state())).catch(() => {});
    }, 3_000);
    try {
      if (request.vantage === "server") await this.probe(request, signal, async stage => {stages.push(stage); await sample(); report(state());});
      else {
        const job = this.clients.get(id)!;
        job.progress = () => report(state());
        const result = await new Promise<DiagnosticReport>((resolve, reject) => {
          const aborted = () => {job.resolve = undefined; reject(new Error("Diagnostic cancelled or expired"));};
          job.resolve = result => {signal.removeEventListener("abort", aborted); resolve(result);};
          signal.addEventListener("abort", aborted, {once: true});
          if (signal.aborted) aborted();
          else if (job.report && job.complete) job.resolve(job.report);
        });
        stages.push(...result.stages);
        await sample();
        return {...state(), runner: result.runner, finishedAt: Date.now(), successful: stages.length > 0 && stages.every(stage => stage.ok)};
      }
      return {...state(), finishedAt: Date.now(), successful: stages.length > 0 && stages.every(stage => stage.ok)};
    } finally {clearInterval(timer); this.clients.delete(id);}
  }

  private profiles(request: DiagnosticRequest): DiagnosticProfile[] {
    if (!request.methodIds.length) return [];
    const connection = this.connections.get(request.connectionId!);
    if (connection.status !== "active" || connection.suspended_at) throw new ServiceError(409, "Connection is no longer active");
    const context: SubscriptionContext = {connection, credentials: this.connections.credentials(connection.id), routes: [], subscriptionToken: ""};
    const host = request.family === "ipv6" ? config.domain : config.publicIp || config.domain;
    return request.methodIds.map(id => {
      const method = this.db.methods.list().find(method => method.id === id && method.enabled && this.db.engines.has(method.engine));
      if (!method) throw new ServiceError(409, "Diagnostic method changed; start a new test");
      if (request.kind === "transport-speed") return {methodId: id, protocol: method.protocol, family: "hysteria", config: {
        server: `${host.includes(":") ? `[${host}]` : host}:${method.settings.port}`, auth: context.credentials.hysteria.password,
        tls: {sni: config.domain, insecure: false}}};
      const family = method.protocol === "naive" ? "sing-box" : "mihomo";
      const outbound = family === "sing-box" ? singBoxOutbound(method, context) : mihomoOutbound(method, context);
      return {methodId: id, protocol: method.protocol, family, config: {...outbound, server: host}};
    });
  }
}
