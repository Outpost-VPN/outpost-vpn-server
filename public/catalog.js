const platforms = ["macos", "ios", "android", "windows", "linux"];
const tabs = [...document.querySelectorAll("[data-platform]")];
const panels = [...document.querySelectorAll("[data-platform-panel]")];

const detected = detectPlatform() || document.body.dataset.initialPlatform || "macos";
const requested = new URLSearchParams(location.search).get("platform");
select(platforms.includes(requested) ? requested : detected);
markAutomatic(detected);

for (const tab of tabs) {
  tab.addEventListener("click", () => {
    select(tab.dataset.platform);
    const url = new URL(location.href);
    url.searchParams.set("platform", tab.dataset.platform);
    history.replaceState(null, "", url);
  });
  tab.addEventListener("keydown", (event) => {
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault();
    const current = tabs.indexOf(tab);
    const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const next = tabs[(current + direction + tabs.length) % tabs.length];
    next.focus();
    next.click();
  });
}

document.addEventListener("click", async (event) => {
  const importLink = event.target.closest("[data-import]");
  if (importLink) feedback(importLink, "Открываем приложение…");

  const button = event.target.closest("[data-copy]");
  if (!button) return;
  try {
    await copy(button.dataset.copy);
    feedback(button, "Ссылка скопирована — вставьте её в приложение");
  } catch {
    feedback(button, "Не удалось скопировать ссылку");
  }
});

function select(platform) {
  for (const tab of tabs) {
    const active = tab.dataset.platform === platform;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active) tab.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  for (const panel of panels) panel.hidden = panel.dataset.platformPanel !== platform;
}

function markAutomatic(platform) {
  for (const tab of tabs) {
    const badge = tab.querySelector("[data-auto-badge]");
    if (badge) badge.hidden = tab.dataset.platform !== platform;
  }
}

function detectPlatform() {
  const ua = navigator.userAgent.toLowerCase();
  const ipad = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  if (ipad || /iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  if (/macintosh|mac os/.test(ua)) return "macos";
  if (/windows/.test(ua)) return "windows";
  if (/linux|x11/.test(ua)) return "linux";
  return null;
}

async function copy(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("copy failed");
}

function feedback(element, message) {
  const status = element.closest(".app")?.querySelector(".feedback");
  if (status) status.textContent = message;
}
