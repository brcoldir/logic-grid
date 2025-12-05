// auth.js
console.log("auth.js loaded");

// Make sure presets exists, in case databasesetup.js hasn't finished
if (!window.columnPresets) {
  window.columnPresets = {};
}

// Basic HTML-escape
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// --- Auth state /me ---

async function checkAuth() {
  try {
    const res = await fetch("/me", {
      credentials: "include",
    });

    if (!res.ok) {
      showLoggedOut();
      return;
    }

    const user = await res.json();
    showLoggedIn(user);
  } catch (err) {
    console.error("checkAuth error", err);
    showLoggedOut();
  }
}

function showLoggedIn(user) {
  const authStatus = document.getElementById("authStatus");
  const appSection = document.getElementById("appSection");
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  const adminPortalLink = document.getElementById("adminPortalLink");

  const isAdmin = user.is_admin === true || user.is_admin === 1;
  const safeEmail = escapeHtml(user.email || "");

  if (authStatus) {
    authStatus.innerHTML = `
      <span>Logged in as ${safeEmail}</span>

      <a href="/account" style="text-decoration:none; margin-left: 0.5rem;">
        <button type="button">Account</button>
      </a>

      ${isAdmin ? `
        <a href="/admin" style="text-decoration:none; margin-left: 0.5rem;">
          <button type="button">Admin Portal</button>
        </a>
      ` : ""}

      <button id="logoutBtn" type="button" style="margin-left: 0.5rem;">
        Log out
      </button>
    `;
    authStatus.style.display = "flex";
  }

  if (appSection) appSection.style.display = "block";
  if (loginForm) loginForm.style.display = "none";
  if (signupForm) signupForm.style.display = "none";
  if (adminPortalLink) adminPortalLink.style.display = "none";

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await fetch("/logout", {
          method: "POST",
          credentials: "include",
        });
      } catch (err) {
        console.error("logout error", err);
      }
      showLoggedOut();
    });
  }

  // load column presets now that we are authenticated
  if (typeof loadColumnPresets === "function") {
    loadColumnPresets();
  }

  // refresh protocol dropdown for this user
  if (typeof fetchSavedProtocols === "function") {
    fetchSavedProtocols();
  }
}


function showLoggedOut() {
  const authStatus = document.getElementById("authStatus");
  const appSection = document.getElementById("appSection");
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  const adminPortalLink = document.getElementById("adminPortalLink");

  if (authStatus) authStatus.style.display = "none";
  if (appSection) appSection.style.display = "none";
  if (loginForm) loginForm.style.display = "block";
  if (signupForm) signupForm.style.display = "block";
  if (adminPortalLink) adminPortalLink.style.display = "none";
}

// --- Login / Signup / Okta wiring ---

function attachAuthHandlers() {
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  const adminResetForm = document.getElementById("adminResetForm"); // only if present
  const resetUserSelect = document.getElementById("resetUserSelect");
  const adminResetPasswordInput = document.getElementById("adminResetPassword");

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("loginEmail").value;
      const password = document.getElementById("loginPassword").value;

      try {
        const res = await fetch("/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, password }),
        });

        console.log("LOGIN status:", res.status);

        if (!res.ok) {
          const text = await res.text();
          console.error("LOGIN error body:", text);

          if (res.status === 403) {
            const lower = text.toLowerCase();
            if (lower.includes("pending")) {
              alert("Your account is pending admin approval. Please try again after an admin approves you.");
            } else if (lower.includes("locked")) {
              // Show the lockout message from the server
              alert(text);
            } else {
              alert("Access denied.");
            }
          } else {
            // Usually 401 Unauthorized
            alert("Invalid email or password");
          }
          return;
        }

        await checkAuth();
        alert("Logged in successfully");
      } catch (err) {
        console.error("login error", err);
        alert("Login failed (see console)");
      }
    });
  }

  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("signupEmail").value;
      const password = document.getElementById("signupPassword").value;

      try {
        const res = await fetch("/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, password }),
        });

        console.log("SIGNUP status:", res.status);

        if (!res.ok) {
          const text = await res.text();
          console.error("SIGNUP error body:", text);

          if (text.toLowerCase().includes("password")) {
            alert("Password needs to meet requirements:\n- At least 8 characters\n- One uppercase letter\n- One lowercase letter\n- One number\n- One special character");
          } else {
            // Fallback for duplicate email or other errors
            alert("Signup failed (email may already exist)");
          }
          return;
        }

        const data = await res.json();
        console.log("SIGNUP response:", data);

        if (data.autoLogin) {
          await checkAuth();
          // 🔹 CHANGED: Generic success message
          alert("Account created! You are now logged in.");
        } else {
          // This path might theoretically never hit now, but good to keep as fallback
          alert("Account created. Please log in.");
        }
      } catch (err) {
        console.error("signup error", err);
        alert("Signup failed (see console)");
      }
    });
  }

  // Okta login button
  const oktaLoginBtn = document.getElementById("oktaLoginBtn");
  if (oktaLoginBtn) {
    oktaLoginBtn.addEventListener("click", () => {
      window.location.href = "/login/okta";
    });
  }

  // Optional admin reset form (if you still keep it on main page)
  if (adminResetForm) {
    adminResetForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (!resetUserSelect || !adminResetPasswordInput) {
        alert("Admin reset controls not found.");
        return;
      }

      const email = resetUserSelect.value.trim();
      const newPassword = adminResetPasswordInput.value;

      if (!email) {
        alert("Please choose a user.");
        return;
      }
      if (!newPassword) {
        alert("New password is required.");
        return;
      }

      try {
        const res = await fetch("/admin/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, newPassword }),
        });

        if (!res.ok) {
          const text = await res.text();
          console.error("admin reset error:", res.status, text);
          if (res.status === 404) {
            alert("User not found for that email.");
          } else if (res.status === 403) {
            alert("You are not authorized to perform this action.");
          } else {
            alert("Failed to reset password (see console).");
          }
          return;
        }

        alert("Password reset successfully. Existing sessions were invalidated.");
        adminResetForm.reset();
      } catch (err) {
        console.error("adminResetForm error:", err);
        alert("Failed to reset password (network error).");
      }
    });
  }
}

// --- Global bootstrap for builder page ---

document.addEventListener("DOMContentLoaded", async () => {
  attachAuthHandlers();
  await checkAuth();

  // If we arrived with ?protocolId=123, auto-load that protocol via protocols.js
  try {
    const params = new URLSearchParams(window.location.search);
    const protocolId = params.get("protocolId");
    if (protocolId && typeof loadProtocolById === "function") {
      await loadProtocolById(protocolId);
    }
  } catch (err) {
    console.error("Error loading protocolId from URL:", err);
  }
});
