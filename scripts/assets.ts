import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

const root = import.meta.dir.replace(/\/scripts$/, "");
const source = join(root, "node_modules", "@phosphor-icons", "web", "src", "regular");
const target = join(root, "public", "vendor", "phosphor");
const assetTarget = join(root, "public", "assets");
const avatarSource = join(root, "assets", "avatars");
const avatarTarget = join(assetTarget, "avatars");
const deviceSource = join(root, "assets", "devices");
const deviceTarget = join(assetTarget, "devices");
const appSource = join(root, "assets", "apps");
const appTarget = join(assetTarget, "apps");
const brandSource = join(root, "assets", "brand");

await mkdir(target, { recursive: true });
await mkdir(assetTarget, { recursive: true });
await mkdir(avatarTarget, { recursive: true });
await mkdir(deviceTarget, { recursive: true });
await mkdir(appTarget, { recursive: true });
for (const filename of await readdir(avatarTarget)) {
  if (/^avatar-(?:person|group|current|\d+)\.(?:png|webp|avif)$/.test(filename)) {
    await rm(join(avatarTarget, filename));
  }
}
for (const filename of ["style.css", "Phosphor.woff2", "Phosphor.woff"]) {
  await Bun.write(join(target, filename), Bun.file(join(source, filename)));
}
for (const filename of await readdir(avatarSource)) {
  if (/^avatar-(?:person|group|current|\d+)\.avif$/.test(filename)) {
    await copyFile(join(avatarSource, filename), join(avatarTarget, filename));
  }
}
for (const filename of await readdir(deviceSource)) {
  if (/^device-[a-z]+-v\d+\.png$/.test(filename)) {
    await copyFile(join(deviceSource, filename), join(deviceTarget, filename));
  }
}
for (const filename of await readdir(appSource)) {
  if (/^[a-z0-9-]+\.(?:jpg|png|svg)$/.test(filename)) {
    await copyFile(join(appSource, filename), join(appTarget, filename));
  }
}
for (const filename of ["brand-mark.png", "brand-mark-success.png"]) {
  await copyFile(join(brandSource, filename), join(root, "public", filename));
}
