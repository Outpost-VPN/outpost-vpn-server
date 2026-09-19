import { z } from "zod";

const port = z.union([
  z.number().int().min(1).max(65535),
  z.string().regex(/^\d{1,5}-\d{1,5}$/).refine((value) => {
    const [first, last] = value.split("-").map(Number);
    return first! >= 1 && last! <= 65535 && first! <= last!;
  }, "Use a port range from 1 to 65535, with the start before the end."),
]);
const ports = z.array(port).min(1).max(64);

export const mihomoSettingsSchema = z.object({
  dnsMode: z.enum(["fake-ip", "redir-host"]),
  sniffing: z.boolean(),
  httpPorts: ports,
  tlsPorts: ports,
  quicPorts: ports,
}).strict();

export const networkSettingsSchema = z.object({
  ipv6: z.boolean(),
  blockQuic: z.boolean(),
  mihomo: mihomoSettingsSchema,
}).strict();

export type NetworkSettings = z.infer<typeof networkSettingsSchema>;

// Preserve the shipped profile behavior when upgrading an existing server.
export const networkDefaults: NetworkSettings = {
  ipv6: false,
  blockQuic: true,
  mihomo: {
    dnsMode: "fake-ip",
    sniffing: true,
    httpPorts: [80, "8080-8880"],
    tlsPorts: [443, 8080, 8443],
    quicPorts: [443, 8443],
  },
};

export const settingsPatchSchema = z.object({
  interface: z.object({ compact: z.boolean().optional() }).strict().optional(),
  system: z.object({
    timezone: z.string().min(1).max(100).optional(),
    updateChannel: z.enum(["stable", "candidate"]).optional(),
  }).strict().optional(),
  network: networkSettingsSchema.omit({ mihomo: true }).partial().extend({
    mihomo: mihomoSettingsSchema.partial().optional(),
  }).strict().optional(),
}).strict();
