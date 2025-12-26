// forgot.js
if (typeof API_BASE === 'undefined') { var API_BASE = (window.API_BASE || 'http://localhost:4000') + '/api'; }

const forgotFormEl = document.getElementById("forgotForm");
if (forgotFormEl) {
  forgotFormEl.addEventListener("submit", async function (e) {
    e.preventDefault();

    const email = document.getElementById("forgotEmail").value;

    const res = await fetch(`${API_BASE}/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
    });

    const data = await res.json();

    if (res.ok) {
        alert("Reset link sent to your email!");
    } else {
        alert(data.message || "Error sending reset link");
    }
});
