const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = { slots: [], items: [], settings: {}, username: "" };
const groupNames = { opening: "Mở đầu", beginning: "Những ngày đầu", moments: "Khoảnh khắc", journey: "Hành trình", people: "Mọi người", closing: "Khép lại" };

function node(tag, className = "", text = "") {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== "") el.textContent = text;
  return el;
}

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: "same-origin", ...options });
  let payload = {};
  try { payload = await response.json(); } catch { /* keep the generic response message */ }
  if (!response.ok) throw new Error(payload.error || `Yêu cầu thất bại (${response.status}).`);
  return payload;
}

function notice(message, isError = false) {
  const el = $("#notice");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("ok", !isError);
}

function field(labelText, control) {
  const wrap = node("div", "field");
  const label = node("label", "", labelText);
  label.htmlFor = control.id;
  wrap.append(label, control);
  return wrap;
}

function input(type, value, id, maxLength) {
  const el = document.createElement("input");
  el.type = type; el.value = value || ""; el.id = id;
  if (maxLength) el.maxLength = maxLength;
  return el;
}

function button(text, className, handler) {
  const el = node("button", `btn ${className || ""}`, text);
  el.type = "button"; el.addEventListener("click", handler); return el;
}

function renderSlots() {
  const root = $("#slot-groups");
  root.replaceChildren();
  const groups = new Map();
  for (const slot of state.slots) {
    if (!groups.has(slot.section)) groups.set(slot.section, []);
    groups.get(slot.section).push(slot);
  }
  const sectionOrder = Object.keys(groupNames);
  for (const [section, slots] of [...groups].sort((a, b) => sectionOrder.indexOf(a[0]) - sectionOrder.indexOf(b[0]))) {
    const group = node("section", "slot-group");
    const head = node("div", "group-title");
    head.append(node("h2", "", groupNames[section] || section), node("small", "", `${String(slots.length).padStart(2, "0")} VỊ TRÍ ẢNH`));
    const grid = node("div", "slot-grid");
    slots.forEach((slot) => grid.append(renderSlot(slot)));
    group.append(head, grid); root.append(group);
  }
  if (!state.slots.length) root.append(node("p", "loading", "Chưa có vị trí ảnh trong cơ sở dữ liệu."));
}

function renderSlot(slot) {
  const card = node("article", "slot-card");
  const preview = node("div", `slot-preview${slot.image_url ? "" : " empty"}`);
  preview.style.aspectRatio = slot.aspect_ratio.replace(":", " / ");
  let image;
  if (slot.image_url) {
    image = document.createElement("img"); image.src = slot.image_url; image.alt = slot.caption || "Ảnh xem trước";
    image.style.objectPosition = `${slot.focal_x}% ${slot.focal_y}%`; image.loading = "lazy"; preview.append(image);
  }
  const meta = node("div", "slot-meta");
  meta.append(node("h3", "", slot.caption || "Chưa có chú thích"), node("span", "slot-id", `${slot.slot_id} · ${slot.aspect_ratio}`));
  const form = node("div", "slot-form");
  const caption = input("text", slot.caption, `caption-${slot.slot_id}`, 240);
  const date = input("text", slot.event_date, `date-${slot.slot_id}`, 100); date.placeholder = "Ví dụ: Tháng 6, 2025";
  const x = input("range", String(slot.focal_x ?? 50), `x-${slot.slot_id}`); x.min = 0; x.max = 100;
  const y = input("range", String(slot.focal_y ?? 50), `y-${slot.slot_id}`); y.min = 0; y.max = 100;
  const focal = node("div", "focal");
  const xField = field("Vị trí ngang", x), yField = field("Vị trí dọc", y);
  for (const range of [x, y]) range.addEventListener("input", () => { if (image) image.style.objectPosition = `${x.value}% ${y.value}%`; });
  focal.append(xField, yField);
  const status = node("p", "field-help"); status.setAttribute("aria-live", "polite");
  const actions = node("div", "slot-actions");
  const file = input("file", "", `file-${slot.slot_id}`); file.accept = "image/jpeg,image/png,image/webp"; file.className = "file-input";
  const choose = node("label", "btn btn-quiet btn-small", slot.image_url ? "Thay ảnh" : "Chọn ảnh"); choose.htmlFor = file.id;
  const save = button("Lưu thông tin", "btn-small", async () => {
    save.disabled = true; status.textContent = "Đang lưu…";
    try {
      await api(`/api/admin/slots/${encodeURIComponent(slot.slot_id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caption: caption.value, event_date: date.value || null, focal_x: Number(x.value), focal_y: Number(y.value) }) });
      slot.caption = caption.value.trim(); slot.event_date = date.value || null; slot.focal_x = Number(x.value); slot.focal_y = Number(y.value);
      meta.querySelector("h3").textContent = slot.caption || "Chưa có chú thích"; status.textContent = "Đã lưu."; notice("Thông tin ô ảnh đã được lưu.");
    } catch (error) { status.textContent = error.message; notice(error.message, true); }
    finally { save.disabled = false; }
  });
  file.addEventListener("change", async () => {
    const selected = file.files?.[0]; if (!selected) return;
    if (selected.size > 12 * 1024 * 1024) { status.textContent = "Ảnh phải nhỏ hơn 12 MB."; file.value = ""; return; }
    status.textContent = "Đang tải ảnh lên…"; choose.classList.add("hidden");
    try {
      const init = await api(`/api/admin/slots/${encodeURIComponent(slot.slot_id)}/upload-url`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_type: selected.type, size: selected.size }),
      });
      const uploaded = await fetch(init.upload_url, { method: "PUT", headers: init.headers, body: selected });
      if (!uploaded.ok) throw new Error("R2 không nhận được ảnh. Vui lòng thử lại.");
      const result = await api(`/api/admin/slots/${encodeURIComponent(slot.slot_id)}/upload-complete`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upload_id: init.upload_id }),
      });
      slot.image_url = result.image_url; status.textContent = "Ảnh đã được cập nhật."; notice("Ảnh đã tải lên và được gắn vào đúng vị trí."); renderSlots();
    } catch (error) { status.textContent = error.message; notice(error.message, true); choose.classList.remove("hidden"); }
    file.value = "";
  });
  actions.append(file, choose, save);
  if (slot.image_url) actions.append(button("Xóa ảnh", "btn-danger btn-small", async () => {
    if (!confirm(`Xóa ảnh khỏi vị trí “${slot.caption || slot.slot_id}”?`)) return;
    try { await api(`/api/admin/slots/${encodeURIComponent(slot.slot_id)}/image`, { method: "DELETE" }); slot.image_url = null; renderSlots(); notice("Đã xóa ảnh khỏi vị trí."); }
    catch (error) { notice(error.message, true); }
  }));
  form.append(field("Chú thích", caption), field("Ngày tháng", date), focal, status, actions);
  card.append(preview, meta, form);
  return card;
}

function itemKindLabel(kind) { return ({ memory: "KHOẢNH KHẮC", timeline: "HÀNH TRÌNH", member: "THÀNH VIÊN", message: "LỜI NHẮN" })[kind] || kind; }

function renderItems() {
  const root = $("#items-list"), filter = $("#kind-filter").value;
  root.replaceChildren();
  const visible = state.items.filter((item) => filter === "all" || item.kind === filter);
  const byKind = new Map();
  for (const item of visible) { if (!byKind.has(item.kind)) byKind.set(item.kind, []); byKind.get(item.kind).push(item); }
  for (const [kind, items] of byKind) {
    items.forEach((item, index) => root.append(renderItem(item, index, items)));
  }
  if (!visible.length) root.append(node("p", "loading", "Chưa có nội dung ở mục này."));
}

function renderItem(item, index, list) {
  const card = node("article", "item-card");
  const reorder = node("div", "order");
  const up = button("↑", "btn-quiet btn-small", () => reorderItem(item, -1)); up.disabled = index === 0; up.setAttribute("aria-label", "Đưa lên trước");
  const down = button("↓", "btn-quiet btn-small", () => reorderItem(item, 1)); down.disabled = index === list.length - 1; down.setAttribute("aria-label", "Đưa xuống sau");
  reorder.append(up, down);
  const fields = node("div", "item-fields");
  const title = input("text", item.title, `item-title-${item.item_id}`, 160);
  const date = input("text", item.event_date, `item-date-${item.item_id}`, 100); date.placeholder = "Ngày tháng (nếu có)";
  const nickname = input("text", item.nickname, `item-nick-${item.item_id}`, 160); nickname.placeholder = "Biệt danh / người gửi";
  const body = document.createElement("textarea"); body.id = `item-body-${item.item_id}`; body.value = item.body || ""; body.maxLength = 2000;
  fields.append(field("Tiêu đề / tên", title), field("Ngày tháng", date), field("Biệt danh / người gửi", nickname));
  const description = field("Mô tả / nội dung", body); description.classList.add("wide"); fields.append(description);
  const actions = node("div", "item-actions");
  const status = node("span", "field-help"); status.setAttribute("aria-live", "polite");
  actions.append(status, button("Lưu", "btn-small", async () => {
    try {
      await api(`/api/admin/items/${encodeURIComponent(item.item_id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.value, body: body.value, event_date: date.value || null, nickname: nickname.value }) });
      Object.assign(item, { title: title.value.trim(), body: body.value.trim(), event_date: date.value || null, nickname: nickname.value.trim() });
      status.textContent = "Đã lưu"; notice("Nội dung đã được cập nhật.");
    } catch (error) { status.textContent = error.message; notice(error.message, true); }
  }), button("Xóa", "btn-danger btn-small", async () => {
    if (!confirm(`Xóa mục “${item.title}” khỏi kỷ yếu? Ảnh gắn với mục này cũng sẽ bị xóa.`)) return;
    try { await api(`/api/admin/items/${encodeURIComponent(item.item_id)}`, { method: "DELETE" }); state.items = state.items.filter((entry) => entry.item_id !== item.item_id); renderItems(); notice("Đã xóa nội dung."); }
    catch (error) { notice(error.message, true); }
  }));
  card.append(reorder, fields, actions);
  const kind = node("span", "eyebrow", itemKindLabel(item.kind));
  fields.prepend(kind);
  return card;
}

async function reorderItem(item, direction) {
  const sameKind = state.items.filter((entry) => entry.kind === item.kind).sort((a, b) => a.display_order - b.display_order);
  const index = sameKind.findIndex((entry) => entry.item_id === item.item_id), target = index + direction;
  if (target < 0 || target >= sameKind.length) return;
  [sameKind[index], sameKind[target]] = [sameKind[target], sameKind[index]];
  try {
    await api("/api/admin/order", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: item.kind, ids: sameKind.map((entry) => entry.item_id) }) });
    sameKind.forEach((entry, order) => { entry.display_order = order + 1; }); renderItems(); notice("Thứ tự nội dung đã được cập nhật.");
  } catch (error) { notice(error.message, true); }
}

function renderSettings() {
  const s = state.settings;
  $("#hero-lead").value = s.hero_lead || ""; $("#hero-line").value = s.hero_line || ""; $("#hero-accent").value = s.hero_accent || ""; $("#hero-intro").value = s.hero_intro || "";
  $("#closing-title").value = (s.closing_title || "").replaceAll("\\n", "\n"); $("#closing-body").value = s.closing_body || "";
}

async function loadCms() {
  const [content, items, settings] = await Promise.all([
    api("/api/public/content"), api("/api/admin/items"), api("/api/admin/settings"),
  ]);
  state.slots = content.slots || []; state.items = items.items || []; state.settings = settings;
  renderSlots(); renderItems(); renderSettings();
}

function showAdmin(username) {
  $("#login-view").classList.add("hidden"); $("#admin-view").classList.remove("hidden"); $("#logout").classList.remove("hidden");
  $("#admin-identity").textContent = `ĐANG ĐĂNG NHẬP · ${username}`; state.username = username;
  loadCms().catch((error) => notice(error.message, true));
}

async function boot() {
  try {
    const session = await api("/api/admin/session");
    if (session.authenticated) showAdmin(session.username || session.email);
    else {
      $("#login-view").classList.remove("hidden");
      $("#show-register").classList.toggle("hidden", !session.registration_available);
    }
  } catch (error) {
    $("#login-view").classList.remove("hidden"); $("#login-status").textContent = error.message;
  }
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const status = $("#login-status"); status.textContent = "Đang xác thực…";
  const buttonEl = event.currentTarget.querySelector("button[type=submit]"); buttonEl.disabled = true;
  try {
    const result = await api("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: $("#username").value, password: $("#password").value }) });
    $("#password").value = ""; showAdmin(result.username); status.textContent = "";
  } catch (error) { status.textContent = error.message; }
  finally { buttonEl.disabled = false; }
});

$("#show-register").addEventListener("click", () => {
  $("#login-panel").classList.add("hidden"); $("#register-form").classList.remove("hidden"); $("#register-username").focus();
});

$("#show-login").addEventListener("click", () => {
  $("#register-form").classList.add("hidden"); $("#login-panel").classList.remove("hidden"); $("#username").focus();
});

$("#register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget, submit = form.querySelector("button[type=submit]"), status = $("#register-status");
  submit.disabled = true; status.textContent = "Đang tạo tài khoản…";
  try {
    const result = await api("/api/admin/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: $("#register-username").value, password: $("#register-password").value, setup_token: $("#setup-token").value }) });
    $("#register-password").value = ""; $("#setup-token").value = ""; showAdmin(result.username); status.textContent = "";
  } catch (error) { status.textContent = error.message; }
  finally { submit.disabled = false; }
});

$("#logout").addEventListener("click", async () => {
  try { await api("/api/admin/logout", { method: "POST" }); } finally { location.reload(); }
});

function activateTab(tab, moveFocus = false) {
  $$("[data-tab]").forEach((buttonEl) => {
    const active = buttonEl === tab;
    buttonEl.classList.toggle("active", active); buttonEl.setAttribute("aria-selected", String(active)); buttonEl.tabIndex = active ? 0 : -1;
  });
  $$("[data-panel]").forEach((panel) => panel.classList.toggle("hidden", panel.dataset.panel !== tab.dataset.tab));
  if (moveFocus) tab.focus();
}

const tabs = $$("[data-tab]");
tabs.forEach((tab) => {
  tab.addEventListener("click", () => activateTab(tab));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = tabs.indexOf(tab);
    const target = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    activateTab(tabs[target], true);
  });
});

$("#kind-filter").addEventListener("change", renderItems);
$("#refresh-slots").addEventListener("click", () => loadCms().then(() => notice("Nội dung đã được làm mới.")).catch((error) => notice(error.message, true)));

$("#add-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget, submit = form.querySelector("button[type=submit]"); submit.disabled = true;
  try {
    await api("/api/admin/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: $("#new-kind").value, title: $("#new-title").value, body: $("#new-body").value, event_date: $("#new-date").value || null, nickname: $("#new-nickname").value }) });
    form.reset(); await loadCms(); notice("Đã thêm nội dung mới. Vị trí ảnh tương ứng đã sẵn sàng.");
  } catch (error) { notice(error.message, true); }
  finally { submit.disabled = false; }
});

$("#opening-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const values = { hero_lead: $("#hero-lead").value, hero_line: $("#hero-line").value, hero_accent: $("#hero-accent").value, hero_intro: $("#hero-intro").value };
    await api("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) }); Object.assign(state.settings, values); notice("Lời mở đầu đã được lưu.");
  } catch (error) { notice(error.message, true); }
});

$("#closing-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const values = { closing_title: $("#closing-title").value.replaceAll("\n", "\\n"), closing_body: $("#closing-body").value };
    await api("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) }); Object.assign(state.settings, values); notice("Lời kết đã được lưu.");
  } catch (error) { notice(error.message, true); }
});

boot();
