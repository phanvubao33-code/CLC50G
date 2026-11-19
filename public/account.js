const $ = (selector) => document.querySelector(selector);

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: "same-origin", ...options });
  let payload = {};
  try { payload = await response.json(); } catch { /* keep the generic message */ }
  if (!response.ok) throw new Error(payload.error || `Yêu cầu thất bại (${response.status}).`);
  return payload;
}

function showAccount(account) {
  $("#auth-view").classList.add("hidden");
  $("#account-view").classList.remove("hidden");
  $("#welcome").textContent = `Chào ${account.username}.`;
  $("#account-role").textContent = account.role === "admin" ? "Tài khoản này có quyền quản trị kỷ yếu." : "Tài khoản thành viên của lớp mình đã sẵn sàng.";
  $("#admin-link").classList.toggle("hidden", account.role !== "admin");
}

function setTab(tab) {
  const login = tab === "login";
  $("#tab-login").setAttribute("aria-selected", String(login));
  $("#tab-register").setAttribute("aria-selected", String(!login));
  $("#login-form").classList.toggle("hidden", !login);
  $("#register-form").classList.toggle("hidden", login);
  (login ? $("#login-username") : $("#register-username")).focus();
}

async function boot() {
  try {
    const state = await api("/api/auth/session");
    if (state.authenticated) showAccount(state);
    else $("#auth-view").classList.remove("hidden");
  } catch (error) {
    $("#auth-view").classList.remove("hidden");
    $("#login-status").textContent = error.message;
  }
}

$("#tab-login").addEventListener("click", () => setTab("login"));
$("#tab-register").addEventListener("click", () => setTab("register"));

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = event.currentTarget.querySelector("button[type=submit]"), status = $("#login-status");
  submit.disabled = true; status.classList.remove("ok"); status.textContent = "Đang đăng nhập…";
  try { showAccount(await api("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: $("#login-username").value, password: $("#login-password").value }) })); }
  catch (error) { status.textContent = error.message; }
  finally { submit.disabled = false; }
});

$("#register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = event.currentTarget.querySelector("button[type=submit]"), status = $("#register-status");
  submit.disabled = true; status.classList.remove("ok"); status.textContent = "Đang tạo tài khoản…";
  try { showAccount(await api("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: $("#register-username").value, password: $("#register-password").value }) })); }
  catch (error) { status.textContent = error.message; }
  finally { submit.disabled = false; }
});

$("#logout").addEventListener("click", async () => {
  const status = $("#account-status");
  try { await api("/api/auth/logout", { method: "POST" }); location.reload(); }
  catch (error) { status.textContent = error.message; }
});

boot();
