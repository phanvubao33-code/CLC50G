const $ = (selector) => document.querySelector(selector);

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: "same-origin", ...options });
  let payload = {};
  try { payload = await response.json(); } catch { /* use a general response message */ }
  if (!response.ok) throw new Error(payload.error || `Yêu cầu thất bại (${response.status}).`);
  return payload;
}

async function boot() {
  try {
    const session = await api("/api/auth/session");
    if (session.authenticated) {
      $("#welcome").textContent = `Chào ${session.username}.`;
      $("#signed-in").classList.remove("hidden");
      location.replace("/account/");
      return;
    }
  } catch { /* The form still appears so a temporary API issue is visible on submit. */ }
  $("#login-view").classList.remove("hidden");
  $("#username").focus();
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type=submit]");
  const status = $("#login-status");
  button.disabled = true;
  status.textContent = "Đang đăng nhập…";
  try {
    await api("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: $("#username").value, password: $("#password").value }),
    });
    location.assign("/account/");
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
});

boot();
