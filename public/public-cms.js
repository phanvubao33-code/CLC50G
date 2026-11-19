let activeFigureIndex = 0;
let focusBeforeLightbox = null;

function textNode(tag, className, value) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = value || "";
  return el;
}

function makeEmptySlot(slotId, ratio, caption) {
  const slot = document.createElement("div");
  slot.className = "slot empty";
  slot.dataset.slot = slotId;
  slot.dataset.ratio = ratio;
  slot.style.aspectRatio = ratio.replace(":", " / ");
  slot.setAttribute("role", "img");
  slot.setAttribute("aria-label", `${caption || "Ảnh kỷ yếu"} · ô ảnh chờ cập nhật`);
  slot.append(textNode("span", "empty-mark", `${caption || "Ô ảnh chờ cập nhật"} · ${ratio}`));
  return slot;
}

function setSlotImage(slotElement, slot) {
  if (!slotElement || !slot) return;
  slotElement.dataset.ratio = slot.aspect_ratio;
  slotElement.style.aspectRatio = slot.aspect_ratio.replace(":", " / ");
  slotElement.setAttribute("aria-label", slot.image_url ? slot.caption || "Ảnh kỷ yếu" : `${slot.caption || "Ảnh kỷ yếu"} · ô ảnh chờ cập nhật`);
  const mark = slotElement.querySelector(".empty-mark");
  if (mark) mark.textContent = `${slot.caption || "Ô ảnh chờ cập nhật"} · ${slot.aspect_ratio}`;
  if (!slot.image_url) return;
  slotElement.classList.add("loading");
  let image = slotElement.querySelector("img");
  if (!image) { image = document.createElement("img"); slotElement.prepend(image); }
  let loadingMark = slotElement.querySelector(".empty-mark");
  if (!loadingMark) {
    loadingMark = document.createElement("span"); loadingMark.className = "empty-mark"; slotElement.append(loadingMark);
  }
  loadingMark.textContent = "Đang tải ảnh…";
  image.onload = () => { slotElement.classList.remove("empty", "loading"); loadingMark.remove(); };
  image.onerror = () => {
    slotElement.classList.remove("loading"); slotElement.classList.add("empty"); image.remove();
    loadingMark.textContent = `${slot.caption || "Ảnh chưa khả dụng"} · ${slot.aspect_ratio}`;
  };
  image.alt = slot.caption || "Ảnh kỷ yếu";
  image.loading = slot.slot_id === "hero-main" ? "eager" : "lazy";
  image.decoding = "async";
  image.style.objectPosition = `${slot.focal_x ?? 50}% ${slot.focal_y ?? 50}%`;
  if (slot.slot_id === "hero-main") image.fetchPriority = "high";
  image.src = slot.image_url;
}

function sorted(items, kind) {
  return items.filter((item) => item.kind === kind).sort((a, b) => a.display_order - b.display_order);
}

function renderMemories(items, slots) {
  const grid = document.querySelector("#memory-grid"); if (!grid) return;
  const map = new Map(slots.map((slot) => [slot.slot_id, slot]));
  const figures = sorted(items, "memory").map((item) => {
    const slot = map.get(item.slot_id);
    const figure = document.createElement("figure"); figure.className = "memory reveal"; figure.dataset.slot = item.slot_id || ""; figure.dataset.caption = `${item.title}${item.event_date ? ` — ${item.event_date}` : ""}`;
    figure.tabIndex = 0; figure.setAttribute("role", "button"); figure.setAttribute("aria-label", `Xem ảnh: ${item.title}`);
    figure.append(makeEmptySlot(item.slot_id || "", slot?.aspect_ratio || "4:3", item.title));
    const cap = document.createElement("figcaption"); cap.append(textNode("span", "", item.title), textNode("span", "", item.event_date || "")); figure.append(cap);
    setSlotImage(figure.querySelector(".slot"), slot);
    return figure;
  });
  grid.replaceChildren(...figures);
}

function renderTimeline(items, slots) {
  const root = document.querySelector("#timeline-events"); if (!root) return;
  const map = new Map(slots.map((slot) => [slot.slot_id, slot]));
  const events = sorted(items, "timeline").map((item) => {
    const event = document.createElement("article"); event.className = "event reveal";
    const time = document.createElement("time"); time.className = "event-date"; time.textContent = item.event_date || "";
    const body = document.createElement("div"); body.className = "event-body";
    const copy = document.createElement("div"); copy.append(textNode("h3", "serif", item.title), textNode("p", "", item.body));
    const slot = map.get(item.slot_id); const image = makeEmptySlot(item.slot_id || "", slot?.aspect_ratio || "4:3", item.title);
    body.append(copy, image); event.append(time, body); setSlotImage(image, slot); return event;
  });
  root.replaceChildren(...events);
}

function renderMembers(items, slots) {
  const root = document.querySelector("#member-grid"); if (!root) return;
  const map = new Map(slots.map((slot) => [slot.slot_id, slot]));
  const members = sorted(items, "member").map((item) => {
    const member = document.createElement("article"); member.className = "member reveal"; member.dataset.slot = item.slot_id || ""; member.dataset.caption = item.title;
    member.tabIndex = 0; member.setAttribute("role", "button"); member.setAttribute("aria-label", `Xem ảnh: ${item.title}`);
    const slot = map.get(item.slot_id); const image = makeEmptySlot(item.slot_id || "", slot?.aspect_ratio || "3:4", item.title);
    member.append(image, textNode("div", "member-name", item.title), textNode("div", "member-note", item.body || item.nickname)); setSlotImage(image, slot); return member;
  });
  root.replaceChildren(...members);
}

function renderMessages(items) {
  const root = document.querySelector("#messages-list"); if (!root) return;
  root.replaceChildren(...sorted(items, "message").map((item) => {
    const quote = document.createElement("blockquote"); quote.className = "reveal";
    quote.append(textNode("p", "quote", `“${item.body}”`), textNode("footer", "quote-by", item.nickname || item.title)); return quote;
  }));
}

function applySettings(settings) {
  const title = document.querySelector(".hero-title");
  if (title && settings.hero_lead) {
    title.replaceChildren(document.createTextNode(settings.hero_lead), document.createElement("br"), document.createTextNode(`${settings.hero_line || ""} `));
    const accent = document.createElement("em"); accent.textContent = settings.hero_accent || ""; title.append(accent);
  }
  const intro = document.querySelector(".hero .intro"); if (intro && settings.hero_intro) intro.textContent = settings.hero_intro;
  const closing = document.querySelector(".closing h2");
  if (closing && settings.closing_title) {
    closing.replaceChildren(...settings.closing_title.split("\\n").flatMap((line, index, lines) => index < lines.length - 1 ? [document.createTextNode(line), document.createElement("br")] : [document.createTextNode(line)]));
  }
  const closingBody = document.querySelector(".closing p"); if (closingBody && settings.closing_body) closingBody.textContent = settings.closing_body;
}

function observeInsertedContent() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.querySelectorAll("#memory-grid .reveal,#timeline-events .reveal,#member-grid .reveal,#messages-list .reveal").forEach((el) => el.classList.add("visible", "in-view"));
    return;
  }
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (entry.isIntersecting) { entry.target.classList.add("visible", "in-view"); observer.unobserve(entry.target); }
  }), { threshold: .12 });
  document.querySelectorAll("#memory-grid .reveal,#timeline-events .reveal,#member-grid .reveal,#messages-list .reveal").forEach((el) => observer.observe(el));
}

async function loadPublishedContent() {
  try {
    const response = await fetch("/api/public/content", { headers: { Accept: "application/json" }, credentials: "same-origin" });
    if (!response.ok) return;
    const data = await response.json();
    if (!Array.isArray(data.slots) || !Array.isArray(data.items)) return;
    const slots = new Map(data.slots.map((slot) => [slot.slot_id, slot]));
    document.querySelectorAll(".slot[data-slot]").forEach((el) => {
      if (!el.closest("#memory-grid,#timeline-events,#member-grid")) setSlotImage(el, slots.get(el.dataset.slot));
    });
    const heroCaption = document.querySelector(".hero-caption span:first-child");
    if (heroCaption && slots.get("hero-main")?.caption) heroCaption.textContent = slots.get("hero-main").caption;
    const beginningDate = document.querySelector(".beginning-copy .eyebrow");
    if (beginningDate && slots.get("beginning-01")?.event_date) beginningDate.textContent = slots.get("beginning-01").event_date;
    renderMemories(data.items, data.slots); renderTimeline(data.items, data.slots); renderMembers(data.items, data.slots); renderMessages(data.items); applySettings(data.settings || {}); observeInsertedContent();
  } catch {
    // Static starter content remains available until the Cloudflare CMS is connected.
  }
}

function openLightbox(item) {
  if (!item) return;
  const image = item.querySelector(".slot img");
  if (!image) return;
  const figures = [...document.querySelectorAll("figure.memory,article.member")].filter((figure) => figure.querySelector(".slot img"));
  activeFigureIndex = figures.indexOf(item);
  const dialog = document.querySelector(".lightbox"), dialogImage = dialog.querySelector("img");
  dialogImage.src = image.currentSrc || image.src; dialogImage.alt = image.alt;
  dialog.querySelector(".lb-caption").textContent = item.dataset.caption || image.alt;
  focusBeforeLightbox = document.activeElement;
  dialog.classList.add("open"); document.body.style.overflow = "hidden";
  dialog.querySelector(".lb-close").focus();
}

document.addEventListener("click", (event) => openLightbox(event.target.closest("figure.memory, article.member")));
document.addEventListener("keydown", (event) => {
  const item = event.target.closest?.("figure.memory, article.member");
  if (!item || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault(); openLightbox(item);
});

function installCmsLightbox() {
  const dialog = document.querySelector(".lightbox"); if (!dialog) return;
  const close = dialog.querySelector(".lb-close"), previous = dialog.querySelector(".lb-prev"), next = dialog.querySelector(".lb-next");
  const replaceButton = (button, label, handler) => {
    const copy = button.cloneNode(true); copy.setAttribute("aria-label", label); button.replaceWith(copy); copy.addEventListener("click", handler); return copy;
  };
  const renderAt = (index) => {
    const figures = [...document.querySelectorAll("figure.memory,article.member")].filter((figure) => figure.querySelector(".slot img"));
    if (!figures.length) return;
    activeFigureIndex = (index + figures.length) % figures.length;
    const figure = figures[activeFigureIndex], image = figure.querySelector(".slot img"), view = dialog.querySelector("img");
    view.style.opacity = "0";
    view.onload = () => { view.style.opacity = "1"; };
    view.src = image.currentSrc || image.src; view.alt = image.alt;
    dialog.querySelector(".lb-caption").textContent = figure.dataset.caption || image.alt;
  };
  const freshClose = replaceButton(close, "Đóng", () => {
    dialog.classList.remove("open"); document.body.style.overflow = "";
    const view = dialog.querySelector("img"); view.removeAttribute("src"); view.style.opacity = "";
    if (focusBeforeLightbox instanceof HTMLElement) focusBeforeLightbox.focus();
  });
  replaceButton(previous, "Ảnh trước", () => renderAt(activeFigureIndex - 1));
  replaceButton(next, "Ảnh tiếp theo", () => renderAt(activeFigureIndex + 1));
  dialog.addEventListener("click", (event) => { if (event.target === dialog) freshClose.click(); });
  document.addEventListener("keydown", (event) => {
    if (!dialog.classList.contains("open")) return;
    if (event.key === "Escape") freshClose.click();
    if (event.key === "ArrowLeft") renderAt(activeFigureIndex - 1);
    if (event.key === "ArrowRight") renderAt(activeFigureIndex + 1);
    if (event.key === "Tab") {
      const controls = [...dialog.querySelectorAll("button")];
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
    }
  });
}

installCmsLightbox();
loadPublishedContent();
