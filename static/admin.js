console.log("admin.js loaded");

const userSelect = document.getElementById("adminUserSelect");
const promoteBtn = document.getElementById("promoteBtn");
const demoteBtn = document.getElementById("demoteBtn");
const deleteBtn = document.getElementById("deleteBtn");
const adminResetForm = document.getElementById("adminResetForm");
const adminResetPasswordInput = document.getElementById("adminResetPassword");
const adminResetPasswordConfirmInput = document.getElementById(
  "adminResetPasswordConfirm"
);
const approveBtn = document.getElementById("approveBtn");
const unapproveBtn = document.getElementById("unapproveBtn");
const approvalStatusSpan = document.getElementById("approvalStatus");

let adminUsersCache = [];


async function loadUsers() {
  if (!userSelect) return;

  try {
    const res = await fetch("/admin/users", { credentials: "include" });
    if (!res.ok) {
      console.error("loadUsers status:", res.status);
      alert("Failed to load users (are you still logged in as admin?)");
      return;
    }

    const users = await res.json();
    adminUsersCache = Array.isArray(users) ? users : [];
    const list = adminUsersCache;

    userSelect.innerHTML = "";
    const def = document.createElement("option");
    def.value = "";
    def.textContent = "-- choose user --";
    userSelect.appendChild(def);

    list.forEach((u) => {
      const opt = document.createElement("option");
      opt.value = u.id; // numeric id
      let label = u.email;
      if (u.is_admin) label += " (admin)";
      if (!u.is_approved) label += " [PENDING]";
      opt.textContent = label;
      userSelect.appendChild(opt);
    });

    refreshApprovalStatus();

  } catch (err) {
    console.error("loadUsers error:", err);
    alert("Failed to load users (network error).");
  }
}

function getSelectedUserId() {
  if (!userSelect || userSelect.selectedIndex < 0) return null;
  const opt = userSelect.options[userSelect.selectedIndex];
  const idStr = opt.value;
  const id = parseInt(idStr, 10);
  return Number.isNaN(id) ? null : id;
}


// Promote user
if (promoteBtn) {
  promoteBtn.addEventListener("click", async () => {
    const userId = getSelectedUserId();
    if (!userId) {
      alert("Please choose a user.");
      return;
    }

    if (!confirm("Promote this user to admin?")) return;

    try {
      const res = await fetch("/admin/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("promote error:", res.status, text);
        alert("Failed to promote user (see console).");
        return;
      }

      alert("User promoted to admin.");
      await loadUsers();
    } catch (err) {
      console.error("promoteBtn error:", err);
      alert("Failed to promote user (network error).");
    }
  });
}

// Demote user
if (demoteBtn) {
  demoteBtn.addEventListener("click", async () => {
    const userId = getSelectedUserId();
    if (!userId) {
      alert("Please choose a user.");
      return;
    }

    if (!confirm("Demote this user from admin?")) return;

    try {
      const res = await fetch("/admin/demote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("demote error:", res.status, text);
        alert("Failed to demote user (see console).");
        return;
      }

      alert("User demoted from admin.");
      await loadUsers();
    } catch (err) {
      console.error("demoteBtn error:", err);
      alert("Failed to demote user (network error).");
    }
  });
}


// Delete user
if (deleteBtn) {
  deleteBtn.addEventListener("click", async () => {
    const userId = getSelectedUserId();
    if (!userId) {
      alert("Please choose a user.");
      return;
    }

    if (
      !confirm(
        "Are you sure you want to DELETE this user? This cannot be undone."
      )
    ) {
      return;
    }

    try {
      const res = await fetch("/admin/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("delete error:", res.status, text);
        if (res.status === 409) {
          alert(
            "Cannot delete this user because they still have data (protocols, etc.)."
          );
        } else if (res.status === 404) {
          alert("User not found.");
        } else if (res.status === 400) {
          alert(text || "Bad request.");
        } else {
          alert("Failed to delete user (see console).");
        }
        return;
      }

      alert("User deleted.");
      await loadUsers();
    } catch (err) {
      console.error("deleteBtn error:", err);
      alert("Failed to delete user (network error).");
    }
  });
}

// Reset password
if (adminResetForm) {
  adminResetForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const userId = getSelectedUserId();
    if (!userId) {
      alert("Please choose a user.");
      return;
    }

    const newPassword = adminResetPasswordInput.value;
    const confirmPassword = adminResetPasswordConfirmInput.value;

    if (!newPassword || !confirmPassword) {
      alert("New password and confirmation are required.");
      return;
    }

    if (newPassword !== confirmPassword) {
      alert("New passwords do not match.");
      return;
    }

    // We need the email for /admin/reset-password.
    const opt = userSelect.options[userSelect.selectedIndex];
    const email = opt.textContent.split(" (")[0];

    try {
      const res = await fetch("/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, newPassword }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("reset error:", res.status, text);
        alert("Failed to reset password (see console).");
        return;
      }

      alert("Password reset successfully. Existing sessions invalidated.");
      adminResetPasswordInput.value = "";
      adminResetPasswordConfirmInput.value = "";
    } catch (err) {
      console.error("adminResetForm error:", err);
      alert("Failed to reset password (network error).");
    }
  });
}

function getUserFromCache(id) {
  return adminUsersCache.find((u) => u.id === id) || null;
}

function refreshApprovalStatus() {
  if (!approvalStatusSpan) return;

  const userId = getSelectedUserId();
  if (!userId) {
    approvalStatusSpan.textContent = "";
    return;
  }

  const u = getUserFromCache(userId);
  if (!u) {
    approvalStatusSpan.textContent = "";
    return;
  }

  approvalStatusSpan.textContent = u.is_approved
    ? "Status: approved"
    : "Status: pending approval";
}

if (userSelect) {
  userSelect.addEventListener("change", refreshApprovalStatus);
}

// Approve user
if (approveBtn) {
  approveBtn.addEventListener("click", async () => {
    const userId = getSelectedUserId();
    if (!userId) {
      alert("Please choose a user.");
      return;
    }

    try {
      const res = await fetch("/admin/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("approve error:", res.status, text);
        alert("Failed to approve user (see console).");
        return;
      }

      alert("User approved.");
      await loadUsers();
      refreshApprovalStatus();
    } catch (err) {
      console.error("approveBtn error:", err);
      alert("Failed to approve user (network error).");
    }
  });
}

// Unapprove user
if (unapproveBtn) {
  unapproveBtn.addEventListener("click", async () => {
    const userId = getSelectedUserId();
    if (!userId) {
      alert("Please choose a user.");
      return;
    }

    try {
      const res = await fetch("/admin/unapprove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("unapprove error:", res.status, text);
        alert("Failed to mark user as pending (see console).");
        return;
      }

      alert("User marked as pending.");
      await loadUsers();
      refreshApprovalStatus();
    } catch (err) {
      console.error("unapproveBtn error:", err);
      alert("Failed to mark user as pending (network error).");
    }
  });
}


document.addEventListener("DOMContentLoaded", loadUsers);
