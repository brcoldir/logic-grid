package main

import (
	"bytes"
	"context"
	cryptoRand "crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
	"unicode"

	"golang.org/x/oauth2"

	_ "github.com/mattn/go-sqlite3"
	"golang.org/x/crypto/bcrypt"
)

/* ======================================================
   Application State
   ====================================================== */

const maxJSONSize = 1 << 20 // 1 MB

// isProd is used to toggle things like Secure cookies.
func isProd() bool {
	return os.Getenv("APP_ENV") == "prod"
}

// debugEnabled controls verbose / sensitive logging.
func debugEnabled() bool {
	// General DEBUG flag, plus legacy DEBUG_AI override if you want it.
	if os.Getenv("DEBUG") == "1" {
		return true
	}
	if os.Getenv("DEBUG_AI") == "1" {
		return true
	}
	return false
}

// decodeJSONBody limits JSON size and disallows unknown fields.
func decodeJSONBody(w http.ResponseWriter, r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxJSONSize)
	defer r.Body.Close()

	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}

// withSecurityHeaders adds basic security headers to responses.
func withSecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Content-Security-Policy",
			"default-src 'self'; style-src 'self' 'unsafe-inline';")

		next.ServeHTTP(w, r)
	})
}

// validatePassword enforces minimum security requirements:
// - At least 8 characters
// - At least 1 uppercase, 1 lowercase, 1 number, 1 special char
func validatePassword(p string) error {
	if len(p) < 8 {
		return fmt.Errorf("password must be at least 8 characters long")
	}

	hasUpper := false
	hasLower := false
	hasNumber := false
	hasSpecial := false

	for _, c := range p {
		switch {
		case unicode.IsUpper(c):
			hasUpper = true
		case unicode.IsLower(c):
			hasLower = true
		case unicode.IsNumber(c):
			hasNumber = true
		case unicode.IsPunct(c) || unicode.IsSymbol(c):
			hasSpecial = true
		}
	}

	if !hasUpper || !hasLower || !hasNumber || !hasSpecial {
		return fmt.Errorf("password must contain at least one uppercase, one lowercase, one number, and one special character")
	}
	return nil
}

type App struct {
	db *sql.DB
}

type User struct {
	ID         int64     `json:"id"`
	Email      string    `json:"email"`
	CreatedAt  time.Time `json:"created_at"`
	IsAdmin    bool      `json:"is_admin"`
	IsApproved bool      `json:"is_approved"`
}

type Protocol struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Data      string    `json:"data,omitempty"` // omit in list
	CreatedAt time.Time `json:"created_at"`
	IsPublic  bool      `json:"is_public"`
}

/* ======================================================
   Main
   ====================================================== */

func main() {
	// Choose DB path based on environment
	dbPath := os.Getenv("DATABASE_PATH")
	if dbPath == "" {
		// Local default
		dbPath = "./logicgrid.db?_foreign_keys=on"
	}

	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	// Run schema migration
	_, err = db.Exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        is_approved INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS protocols (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        data TEXT NOT NULL, -- full JSON string
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    );

    -- NEW: column presets table
    CREATE TABLE IF NOT EXISTS column_presets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
		preset_key TEXT NOT NULL UNIQUE,      -- "text_input", "score", etc.
        label      TEXT NOT NULL,            -- nice name for dropdown
        config_json TEXT NOT NULL,           -- full JSON blob used by UI
        standard_order INTEGER               -- 1,2,3,... for your default set (nullable)
    );
`)

	if err != nil {
		log.Fatal("migration error:", err)
	}

	// Add columns if missing (for old DBs)
	if err := ensureIsAdminColumn(db); err != nil {
		log.Fatal("migration error (is_admin):", err)
	}

	if err := ensureIsApprovedColumn(db); err != nil {
		log.Fatal("migration error (is_approved):", err)
	}

	if err := ensureIsPublicColumn(db); err != nil {
		log.Fatal("migration error (is_public):", err)
	}

	// Ensure security columns (lockout/failed attempts)
	if err := ensureSecurityColumns(db); err != nil {
		log.Fatal("migration error (security columns):", err)
	}

	// NEW: Add AI usage tracking
	if err := ensureAIUsageColumn(db); err != nil {
		log.Fatal("migration error (ai usage column):", err)
	}

	// Make Ocean admin automatically (optional)

	// Make Ocean admin automatically (optional)
	if err := ensureAdminUser(db, "brcoldir@gmail.com"); err != nil {
		log.Printf("ensureAdminUser error: %v", err)
	}

	if err := ensureColumnPresetsSeeded(db); err != nil {
		log.Fatal("migration error (column_presets seed):", err)
	}

	app := &App{
		db: db,
	}

	// Serve your static UI
	// Serve static (with security headers)
	fs := http.FileServer(http.Dir("./static"))
	http.Handle("/", withSecurityHeaders(fs))

	// Account page (HTML) – must be logged in
	http.Handle("/account",
		withSecurityHeaders(app.requireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodGet {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				return
			}
			http.ServeFile(w, r, "./static/account.html")
		}))),
	)

	// Admin page (HTML) – protected
	http.Handle("/admin",
		withSecurityHeaders(app.requireAuth(app.requireAdmin(http.HandlerFunc(app.handleAdminPage)))),
	)

	// Auth endpoints
	http.HandleFunc("/signup", app.handleSignup)
	http.HandleFunc("/login", app.handleLogin)
	http.HandleFunc("/logout", app.handleLogout)
	http.HandleFunc("/me", app.handleMe)
	http.HandleFunc("/login/okta", app.handleOktaLogin)
	http.HandleFunc("/oauth/callback", app.handleOktaCallback)
	http.HandleFunc("/logout/okta", app.handleOktaLogout)

	// User self-service password change
	http.Handle("/change-password",
		app.requireAuth(http.HandlerFunc(app.handleChangePassword)),
	)

	// Admin / user-management endpoint (list users for dropdown)
	http.Handle("/admin/users",
		app.requireAuth(app.requireAdmin(http.HandlerFunc(app.handleListUsers))),
	)

	http.Handle("/admin/promote",
		app.requireAuth(app.requireAdmin(http.HandlerFunc(app.handleAdminPromote))),
	)

	http.Handle("/admin/demote",
		app.requireAuth(app.requireAdmin(http.HandlerFunc(app.handleAdminDemote))),
	)

	// Admin API
	http.Handle("/admin/reset-password",
		app.requireAuth(app.requireAdmin(http.HandlerFunc(app.handleAdminResetPassword))),
	)
	// Protocol endpoints (save/list/get)
	http.HandleFunc("/api/protocols", app.handleProtocols)

	// Example of auth-protected endpoint
	http.Handle("/api/protected-test",
		app.requireAuth(http.HandlerFunc(app.handleProtectedTest)),
	)

	http.Handle("/admin/delete-user",
		app.requireAuth(app.requireAdmin(http.HandlerFunc(app.handleAdminDeleteUser))),
	)

	http.Handle("/api/ai/suggest",
		withSecurityHeaders(app.requireAuth(http.HandlerFunc(app.handleAISuggest))))

	http.Handle("/admin/approve",
		app.requireAuth(app.requireAdmin(http.HandlerFunc(app.handleAdminApprove))),
	)

	http.Handle("/admin/unapprove",
		app.requireAuth(app.requireAdmin(http.HandlerFunc(app.handleAdminUnapprove))),
	)

	http.Handle("/api/column-presets",
		withSecurityHeaders(app.requireAuth(http.HandlerFunc(app.handleColumnPresets))),
	)

	log.Println("LogicGrid running on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}

func (a *App) handleAdminPage(w http.ResponseWriter, r *http.Request) {
	// Simple: always serve the static admin page
	http.ServeFile(w, r, "./static/admin.html")
}

// Add this to your App methods.

func (a *App) handleListUsers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "use GET", http.StatusMethodNotAllowed)
		return
	}

	rows, err := a.db.Query(`
        SELECT id, email, is_admin, is_approved
        FROM users
        ORDER BY email COLLATE NOCASE ASC
    `)

	if err != nil {
		log.Printf("handleListUsers: query error: %v", err)
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type userLite struct {
		ID         int64  `json:"id"`
		Email      string `json:"email"`
		IsAdmin    bool   `json:"is_admin"`
		IsApproved bool   `json:"is_approved"`
	}

	var users []userLite
	for rows.Next() {
		var u userLite
		var isAdminInt, isApprovedInt int
		if err := rows.Scan(&u.ID, &u.Email, &isAdminInt, &isApprovedInt); err != nil {
			log.Printf("handleListUsers: scan error: %v", err)
			http.Error(w, "db error", http.StatusInternalServerError)
			return
		}
		u.IsAdmin = isAdminInt == 1
		u.IsApproved = isApprovedInt == 1
		users = append(users, u)
	}

	if err := rows.Err(); err != nil {
		log.Printf("handleListUsers: rows error: %v", err)
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}

type deleteUserRequest struct {
	UserID int64 `json:"userId"`
}

func (a *App) handleAdminDeleteUser(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "use POST", http.StatusMethodNotAllowed)
		return
	}

	ct := r.Header.Get("Content-Type")
	if ct != "" && !strings.HasPrefix(ct, "application/json") {
		http.Error(w, "Content-Type must be application/json", http.StatusUnsupportedMediaType)
		return
	}

	var req deleteUserRequest
	if err := decodeJSONBody(w, r, &req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	if req.UserID <= 0 {
		http.Error(w, "userId required", http.StatusBadRequest)
		return
	}

	// Optional: prevent deleting yourself
	currentID, ok := a.getUserIDFromRequest(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if currentID == req.UserID {
		http.Error(w, "cannot delete your own user", http.StatusBadRequest)
		return
	}

	res, err := a.db.Exec(`DELETE FROM users WHERE id = ?`, req.UserID)
	if err != nil {
		// If you hit FK constraints (protocols linked), you can map to 409:
		if strings.Contains(err.Error(), "FOREIGN KEY") {
			http.Error(w, "cannot delete user with existing data", http.StatusConflict)
			return
		}

		log.Printf("handleAdminDeleteUser: delete error: %v", err)
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	// Also clear any sessions for that user
	_, _ = a.db.Exec(`DELETE FROM sessions WHERE user_id = ?`, req.UserID)

	json.NewEncoder(w).Encode(map[string]any{
		"ok":     true,
		"userId": req.UserID,
	})
}

type approveUserRequest struct {
	UserID int64 `json:"userId"`
}

func (a *App) handleAdminApprove(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "use POST", http.StatusMethodNotAllowed)
		return
	}

	ct := r.Header.Get("Content-Type")
	if ct != "" && !strings.HasPrefix(ct, "application/json") {
		http.Error(w, "Content-Type must be application/json", http.StatusUnsupportedMediaType)
		return
	}

	var req approveUserRequest
	if err := decodeJSONBody(w, r, &req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	if req.UserID <= 0 {
		http.Error(w, "userId required", http.StatusBadRequest)
		return
	}

	_, err := a.db.Exec(`UPDATE users SET is_approved = 1 WHERE id = ?`, req.UserID)
	if err != nil {
		log.Printf("handleAdminApprove: update error: %v", err)
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]any{
		"ok":     true,
		"userId": req.UserID,
	})
}

func (a *App) handleAdminUnapprove(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "use POST", http.StatusMethodNotAllowed)
		return
	}

	ct := r.Header.Get("Content-Type")
	if ct != "" && !strings.HasPrefix(ct, "application/json") {
		http.Error(w, "Content-Type must be application/json", http.StatusUnsupportedMediaType)
		return
	}

	var req approveUserRequest
	if err := decodeJSONBody(w, r, &req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	if req.UserID <= 0 {
		http.Error(w, "userId required", http.StatusBadRequest)
		return
	}

	// Optional safety: don't let an admin mark themselves unapproved
	currentID, ok := a.getUserIDFromRequest(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if currentID == req.UserID {
		http.Error(w, "cannot unapprove your own user", http.StatusBadRequest)
		return
	}

	_, err := a.db.Exec(`UPDATE users SET is_approved = 0 WHERE id = ?`, req.UserID)
	if err != nil {
		log.Printf("handleAdminUnapprove: update error: %v", err)
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]any{
		"ok":     true,
		"userId": req.UserID,
	})
}

/* ======================================================
   Helpers – Sessions
   ====================================================== */

type saveProtocolRequest struct {
	ID         int64  `json:"id"` // 0 or missing = new
	Name       string `json:"name"`
	Data       string `json:"data"`
	Delete     bool   `json:"delete"`
	MakePublic bool   `json:"makePublic"`
}

func (a *App) handleProtocols(w http.ResponseWriter, r *http.Request) {
	// All protocol actions require auth
	userID, ok := a.getUserIDFromRequest(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	switch r.Method {
	case http.MethodGet:
		// GET /api/protocols          -> list
		// GET /api/protocols?id=123   -> fetch one
		idStr := r.URL.Query().Get("id")
		if idStr == "" {
			a.handleListProtocols(w, r, userID)
		} else {
			a.handleGetProtocol(w, r, userID, idStr)
		}

	case http.MethodPost:
		// POST /api/protocols         -> save (create/update)
		a.handleSaveProtocol(w, r, userID)

	default:
		http.Error(w, "use GET or POST", http.StatusMethodNotAllowed)
	}
}

func (a *App) handleListProtocols(w http.ResponseWriter, r *http.Request, userID int64) {
	scope := r.URL.Query().Get("scope")

	var rows *sql.Rows
	var err error

	if scope == "account" {
		// Account page: only this user’s protocols
		rows, err = a.db.Query(`
            SELECT id, name, created_at, is_public
            FROM protocols
            WHERE user_id = ?
            ORDER BY created_at DESC
        `, userID)
	} else {
		// Builder: show my protocols + all public protocols
		rows, err = a.db.Query(`
            SELECT id, name, created_at, is_public
            FROM protocols
            WHERE user_id = ? OR is_public = 1
            ORDER BY is_public DESC, created_at DESC
        `, userID)
	}

	if err != nil {
		log.Printf("handleListProtocols: db error: %v", err)
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var out []Protocol
	for rows.Next() {
		var p Protocol
		if err := rows.Scan(&p.ID, &p.Name, &p.CreatedAt, &p.IsPublic); err != nil {
			log.Printf("handleListProtocols: scan error: %v", err)
			http.Error(w, "db error", http.StatusInternalServerError)
			return
		}
		out = append(out, p)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}

func (a *App) handleGetProtocol(w http.ResponseWriter, r *http.Request, userID int64, idStr string) {
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	var p Protocol
	err = a.db.QueryRow(`
        SELECT id, name, data, created_at, is_public
        FROM protocols
        WHERE id = ? AND (user_id = ? OR is_public = 1)
    `, id, userID).Scan(&p.ID, &p.Name, &p.Data, &p.CreatedAt, &p.IsPublic)
	if err == sql.ErrNoRows {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("handleGetProtocol: db error: %v", err)
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(p)
}

func (a *App) handleSaveProtocol(w http.ResponseWriter, r *http.Request, userID int64) {
	ct := r.Header.Get("Content-Type")
	if ct != "" && !strings.HasPrefix(ct, "application/json") {
		http.Error(w, "Content-Type must be application/json", http.StatusUnsupportedMediaType)
		return
	}

	var req saveProtocolRequest
	if err := decodeJSONBody(w, r, &req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	// Safety: cannot delete and make public in one call
	if req.Delete && req.MakePublic {
		http.Error(w, "cannot combine delete and makePublic", http.StatusBadRequest)
		return
	}

	// 🔹 DELETE path
	if req.Delete {
		if req.ID <= 0 {
			http.Error(w, "id required for delete", http.StatusBadRequest)
			return
		}

		res, err := a.db.Exec(`
            DELETE FROM protocols
            WHERE id = ? AND user_id = ?
        `, req.ID, userID)
		if err != nil {
			log.Printf("handleSaveProtocol: delete error: %v", err)
			http.Error(w, "db error", http.StatusInternalServerError)
			return
		}

		rows, _ := res.RowsAffected()
		if rows == 0 {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}

		w.WriteHeader(http.StatusNoContent)
		return
	}

	// 🔹 MAKE PUBLIC path
	if req.MakePublic {
		if req.ID <= 0 {
			http.Error(w, "id required to make public", http.StatusBadRequest)
			return
		}

		res, err := a.db.Exec(`
            UPDATE protocols
            SET is_public = 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
        `, req.ID, userID)
		if err != nil {
			log.Printf("handleSaveProtocol: makePublic update error: %v", err)
			http.Error(w, "db error", http.StatusInternalServerError)
			return
		}

		rows, _ := res.RowsAffected()
		if rows == 0 {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}

		json.NewEncoder(w).Encode(map[string]any{
			"ok":       true,
			"id":       req.ID,
			"isPublic": true,
		})
		return
	}

	// 🔹 Create / update path: require name + data
	if strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.Data) == "" {
		http.Error(w, "name and data required", http.StatusBadRequest)
		return
	}

	// New or update?
	if req.ID > 0 {
		// Try to update existing (only if it belongs to this user)
		res, err := a.db.Exec(`
            UPDATE protocols
            SET name = ?, data = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
        `, req.Name, req.Data, req.ID, userID)
		if err != nil {
			log.Printf("handleSaveProtocol: update error: %v", err)
			http.Error(w, "db error", http.StatusInternalServerError)
			return
		}

		rows, _ := res.RowsAffected()
		if rows > 0 {
			// Updated successfully (owner editing their own protocol, public or not)
			json.NewEncoder(w).Encode(map[string]any{
				"ok": true,
				"id": req.ID,
			})
			return
		}

		// 🔹 If no rows were updated, treat it as "Save As" and insert a new record.
		// This covers cases where the protocol is public and belongs to someone else.
	}

	// Insert new
	res, err := a.db.Exec(`
        INSERT INTO protocols (user_id, name, data)
        VALUES (?, ?, ?)
    `, userID, req.Name, req.Data)
	if err != nil {
		log.Printf("handleSaveProtocol: insert error: %v", err)
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	newID, _ := res.LastInsertId()
	json.NewEncoder(w).Encode(map[string]any{
		"ok": true,
		"id": newID,
	})
}

func (a *App) generateSessionID() (string, error) {
	b := make([]byte, 32)
	if _, err := cryptoRand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func ensureIsAdminColumn(db *sql.DB) error {
	rows, err := db.Query(`PRAGMA table_info(users);`)
	if err != nil {
		return err
	}
	defer rows.Close()

	hasIsAdmin := false
	for rows.Next() {
		var cid int
		var name, colType string
		var notnull, pk int
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &colType, &notnull, &dflt, &pk); err != nil {
			return err
		}
		if name == "is_admin" {
			hasIsAdmin = true
			break
		}
	}

	if hasIsAdmin {
		return nil // already exists
	}

	_, err = db.Exec(`ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;`)
	return err
}

// --- Add is_approved column to users if missing ---
func ensureIsApprovedColumn(db *sql.DB) error {
	rows, err := db.Query(`PRAGMA table_info(users);`)
	if err != nil {
		return err
	}
	defer rows.Close()

	hasIsApproved := false
	for rows.Next() {
		var cid int
		var name, colType string
		var notnull, pk int
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &colType, &notnull, &dflt, &pk); err != nil {
			return err
		}
		if strings.EqualFold(name, "is_approved") {
			hasIsApproved = true
			break
		}
	}

	if hasIsApproved {
		return nil
	}

	// Add column with default 0 (false)
	if _, err := db.Exec(`ALTER TABLE users ADD COLUMN is_approved INTEGER NOT NULL DEFAULT 0;`); err != nil {
		return err
	}

	// Mark all existing users as approved so you don't lock yourself out
	_, err = db.Exec(`UPDATE users SET is_approved = 1;`)
	return err
}

// --- Add is_public column to protocols if missing ---
func ensureIsPublicColumn(db *sql.DB) error {
	rows, err := db.Query(`PRAGMA table_info(protocols);`)
	if err != nil {
		return err
	}
	defer rows.Close()

	found := false
	for rows.Next() {
		var cid int
		var name, colType string
		var notnull, pk int
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &colType, &notnull, &dflt, &pk); err != nil {
			return err
		}
		if strings.EqualFold(name, "is_public") {
			found = true
			break
		}
	}

	if found {
		return nil
	}

	_, err = db.Exec(`ALTER TABLE protocols ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;`)
	return err
}

// Add this helper function to main.go
func ensureAIUsageColumn(db *sql.DB) error {
	rows, err := db.Query(`PRAGMA table_info(users);`)
	if err != nil {
		return err
	}
	defer rows.Close()

	hasCol := false
	for rows.Next() {
		var cid int
		var name, colType string
		var notnull, pk int
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &colType, &notnull, &dflt, &pk); err != nil {
			return err
		}
		if name == "ai_usage_count" {
			hasCol = true
			break
		}
	}

	if !hasCol {
		if _, err := db.Exec(`ALTER TABLE users ADD COLUMN ai_usage_count INTEGER NOT NULL DEFAULT 0;`); err != nil {
			return err
		}
	}
	return nil
}

func ensureSecurityColumns(db *sql.DB) error {
	rows, err := db.Query(`PRAGMA table_info(users);`)
	if err != nil {
		return err
	}
	defer rows.Close()

	hasFailedAttempts := false
	hasLockoutUntil := false

	for rows.Next() {
		var cid int
		var name, colType string
		var notnull, pk int
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &colType, &notnull, &dflt, &pk); err != nil {
			return err
		}
		if name == "failed_attempts" {
			hasFailedAttempts = true
		}
		if name == "lockout_until" {
			hasLockoutUntil = true
		}
	}

	if !hasFailedAttempts {
		if _, err := db.Exec(`ALTER TABLE users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0;`); err != nil {
			return err
		}
	}
	if !hasLockoutUntil {
		if _, err := db.Exec(`ALTER TABLE users ADD COLUMN lockout_until DATETIME;`); err != nil {
			return err
		}
	}
	return nil
}

func (a *App) setSessionCookie(w http.ResponseWriter, userID int64) error {
	sid, err := a.generateSessionID()
	if err != nil {
		return err
	}

	_, err = a.db.Exec(`INSERT INTO sessions (id, user_id) VALUES (?, ?)`, sid, userID)
	if err != nil {
		log.Printf("setSessionCookie: failed inserting session for user %d: %v", userID, err)
		return err
	}

	log.Printf("setSessionCookie: created session %s for user %d", sid, userID)

	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    sid,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   isProd(),
	})

	return nil
}

func (a *App) getUserIDFromRequest(r *http.Request) (int64, bool) {
	c, err := r.Cookie("session_id")
	if err != nil || c.Value == "" {
		if err != nil {
			log.Printf("getUserIDFromRequest: no cookie: %v", err)
		} else {
			log.Printf("getUserIDFromRequest: empty session_id cookie")
		}
		return 0, false
	}

	var uid int64
	err = a.db.QueryRow(`SELECT user_id FROM sessions WHERE id = ?`, c.Value).Scan(&uid)
	if err == sql.ErrNoRows {
		log.Printf("getUserIDFromRequest: session %s not found", c.Value)
		return 0, false
	}
	if err != nil {
		log.Printf("getUserIDFromRequest: DB error for session %s: %v", c.Value, err)
		return 0, false
	}

	log.Printf("getUserIDFromRequest: session %s -> user %d", c.Value, uid)
	return uid, true
}

func (a *App) clearSession(w http.ResponseWriter, r *http.Request) {
	c, err := r.Cookie("session_id")
	if err == nil {
		_, _ = a.db.Exec(`DELETE FROM sessions WHERE id = ?`, c.Value)
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   isProd(),
	})
}

type promoteUserRequest struct {
	UserID int64 `json:"userId"`
}

func (a *App) handleAdminPromote(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "use POST", http.StatusMethodNotAllowed)
		return
	}

	ct := r.Header.Get("Content-Type")
	if ct != "" && !strings.HasPrefix(ct, "application/json") {
		http.Error(w, "Content-Type must be application/json", http.StatusUnsupportedMediaType)
		return
	}

	var req promoteUserRequest
	if err := decodeJSONBody(w, r, &req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	if req.UserID <= 0 {
		http.Error(w, "userId required", http.StatusBadRequest)
		return
	}

	res, err := a.db.Exec(`UPDATE users SET is_admin = 1 WHERE id = ?`, req.UserID)
	if err != nil {
		log.Printf("handleAdminPromote: update error: %v", err)
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(map[string]any{
		"ok":     true,
		"userId": req.UserID,
	})
}

func (a *App) handleAdminDemote(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "use POST", http.StatusMethodNotAllowed)
		return
	}

	ct := r.Header.Get("Content-Type")
	if ct != "" && !strings.HasPrefix(ct, "application/json") {
		http.Error(w, "Content-Type must be application/json", http.StatusUnsupportedMediaType)
		return
	}
	var req promoteUserRequest
	if err := decodeJSONBody(w, r, &req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	if req.UserID <= 0 {
		http.Error(w, "userId required", http.StatusBadRequest)
		return
	}

	// Optional but sensible: don't let an admin demote themself
	currentID, ok := a.getUserIDFromRequest(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if currentID == req.UserID {
		http.Error(w, "cannot demote your own admin status", http.StatusBadRequest)
		return
	}

	res, err := a.db.Exec(`UPDATE users SET is_admin = 0 WHERE id = ?`, req.UserID)
	if err != nil {
		log.Printf("handleAdminDemote: update error: %v", err)
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(map[string]any{
		"ok":     true,
		"userId": req.UserID,
	})
}

/* ======================================================
   Auth Handlers
   ====================================================== */

type signupRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (a *App) handleSignup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "use POST", http.StatusMethodNotAllowed)
		return
	}

	ct := r.Header.Get("Content-Type")
	if ct != "" && !strings.HasPrefix(ct, "application/json") {
		http.Error(w, "Content-Type must be application/json", http.StatusUnsupportedMediaType)
		return
	}

	var req signupRequest
	if err := decodeJSONBody(w, r, &req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	if req.Email == "" || req.Password == "" {
		http.Error(w, "email and password required", http.StatusBadRequest)
		return
	}

	if err := validatePassword(req.Password); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)

	if err != nil {
		http.Error(w, "hash error", http.StatusInternalServerError)
		return
	}

	// determine if this is the first user; if so, make them admin + approved
	var count int
	if err := a.db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&count); err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	isAdmin := 0
	isApproved := 1
	autoLogin := true

	if count == 0 {
		// bootstrap: first user is admin + approved + auto login
		isAdmin = 1
		isApproved = 1
		autoLogin = true
	}

	res, err := a.db.Exec(
		`INSERT INTO users (email, password_hash, is_admin, is_approved) VALUES (?, ?, ?, ?)`,
		req.Email, string(hash), isAdmin, isApproved,
	)
	if err != nil {
		http.Error(w, "email may already exist", http.StatusBadRequest)
		return
	}

	userID, _ := res.LastInsertId()

	if autoLogin {
		_ = a.setSessionCookie(w, userID)
	}

	json.NewEncoder(w).Encode(map[string]any{
		"ok":              true,
		"userId":          userID,
		"autoLogin":       autoLogin,
		"is_admin":        isAdmin == 1,
		"is_approved":     isApproved == 1,
		"pendingApproval": !autoLogin,
	})

}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (a *App) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "use POST", http.StatusMethodNotAllowed)
		return
	}

	ct := r.Header.Get("Content-Type")
	if ct != "" && !strings.HasPrefix(ct, "application/json") {
		http.Error(w, "Content-Type must be application/json", http.StatusUnsupportedMediaType)
		return
	}
	var req loginRequest
	if err := decodeJSONBody(w, r, &req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	var id int64
	var hash string
	var isApprovedInt int
	var failedAttempts int
	var lockoutUntil sql.NullTime

	// Query for user and lock status
	err := a.db.QueryRow(
		`SELECT id, password_hash, is_approved, COALESCE(failed_attempts, 0), lockout_until FROM users WHERE email = ?`,
		req.Email,
	).Scan(&id, &hash, &isApprovedInt, &failedAttempts, &lockoutUntil)

	if err == sql.ErrNoRows {
		// User not found: return generic error (avoid enumeration)
		http.Error(w, "invalid email or password", http.StatusUnauthorized)
		return
	} else if err != nil {
		log.Printf("handleLogin: db error: %v", err)
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	// Check Lockout
	if lockoutUntil.Valid && time.Now().Before(lockoutUntil.Time) {
		http.Error(w, "Account locked. Too many failed attempts. Please try again in 15 minutes.", http.StatusForbidden)
		return
	}

	// Validate Password
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)) != nil {
		// Failed: increment attempts
		newFailCount := failedAttempts + 1
		if newFailCount >= 3 {
			// Lock for 15 mins
			lockTime := time.Now().Add(15 * time.Minute)
			a.db.Exec(`UPDATE users SET failed_attempts = ?, lockout_until = ? WHERE id = ?`, newFailCount, lockTime, id)
			http.Error(w, "Account locked. Too many failed attempts. Please try again in 15 minutes.", http.StatusForbidden)
		} else {
			a.db.Exec(`UPDATE users SET failed_attempts = ? WHERE id = ?`, newFailCount, id)
			http.Error(w, "invalid email or password", http.StatusUnauthorized)
		}
		return
	}

	// Success: Reset failures and lock status
	if failedAttempts > 0 || lockoutUntil.Valid {
		a.db.Exec(`UPDATE users SET failed_attempts = 0, lockout_until = NULL WHERE id = ?`, id)
	}

	if isApprovedInt == 0 {
		http.Error(w, "account pending approval", http.StatusForbidden)
		return
	}

	_ = a.setSessionCookie(w, id)

	json.NewEncoder(w).Encode(map[string]any{
		"ok":          true,
		"userId":      id,
		"is_approved": true,
	})

}

func (a *App) handleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "use POST", http.StatusMethodNotAllowed)
		return
	}
	a.clearSession(w, r)
	json.NewEncoder(w).Encode(map[string]any{"ok": true})
}

func (a *App) handleMe(w http.ResponseWriter, r *http.Request) {
	userID, ok := a.getUserIDFromRequest(r)
	if !ok {
		log.Printf("handleMe: unauthorized (no valid session)")
		http.Error(w, "not logged in", http.StatusUnauthorized)
		return
	}

	var u User
	var isAdminInt, isApprovedInt int

	err := a.db.QueryRow(
		`SELECT id, email, created_at, is_admin, is_approved FROM users WHERE id = ?`,
		userID,
	).Scan(&u.ID, &u.Email, &u.CreatedAt, &isAdminInt, &isApprovedInt)
	if err != nil {
		log.Printf("handleMe: DB error for user %d: %v", userID, err)
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	u.IsAdmin = isAdminInt == 1
	u.IsApproved = isApprovedInt == 1

	if !u.IsApproved {
		// Extra safety; requireAuth should already block this
		a.clearSession(w, r)
		http.Error(w, "account pending approval", http.StatusForbidden)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	log.Printf("handleMe: returning user %d (%s) admin=%v approved=%v", u.ID, u.Email, u.IsAdmin, u.IsApproved)
	if err := json.NewEncoder(w).Encode(u); err != nil {
		log.Printf("handleMe: encode error: %v", err)
	}
}

func (a *App) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID, ok := a.getUserIDFromRequest(r)
		if !ok || userID == 0 {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		var isAdmin int
		err := a.db.QueryRow(`SELECT is_admin FROM users WHERE id = ?`, userID).Scan(&isAdmin)
		if err != nil {
			log.Printf("requireAdmin: DB error: %v", err)
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
		if isAdmin == 0 {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	})
}

type adminResetPasswordRequest struct {
	Email       string `json:"email"`
	NewPassword string `json:"newPassword"`
}

type changePasswordRequest struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

func (a *App) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "use POST", http.StatusMethodNotAllowed)
		return
	}

	// Ensure we have a logged-in user (requireAuth middleware already checked,
	// but we need the user ID here)
	userID, ok := a.getUserIDFromRequest(r)
	if !ok || userID == 0 {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	ct := r.Header.Get("Content-Type")
	if ct != "" && !strings.HasPrefix(ct, "application/json") {
		http.Error(w, "Content-Type must be application/json", http.StatusUnsupportedMediaType)
		return
	}

	var req changePasswordRequest
	if err := decodeJSONBody(w, r, &req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.CurrentPassword) == "" || strings.TrimSpace(req.NewPassword) == "" {
		http.Error(w, "currentPassword and newPassword required", http.StatusBadRequest)
		return
	}

	if err := validatePassword(req.NewPassword); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Look up current password hash
	var currentHash string
	err := a.db.QueryRow(
		`SELECT password_hash FROM users WHERE id = ?`,
		userID,
	).Scan(&currentHash)
	if err == sql.ErrNoRows {
		http.Error(w, "user not found", http.StatusUnauthorized)
		return
	}
	if err != nil {
		log.Printf("handleChangePassword: DB error: %v", err)
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	// Verify current password
	if bcrypt.CompareHashAndPassword([]byte(currentHash), []byte(req.CurrentPassword)) != nil {
		// account.js treats 401 as "Current password is incorrect."
		http.Error(w, "current password is incorrect", http.StatusUnauthorized)
		return
	}

	// Hash new password
	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("handleChangePassword: hash error: %v", err)
		http.Error(w, "hash error", http.StatusInternalServerError)
		return
	}

	// Update password
	_, err = a.db.Exec(
		`UPDATE users SET password_hash = ? WHERE id = ?`,
		string(newHash), userID,
	)
	if err != nil {
		log.Printf("handleChangePassword: update error: %v", err)
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	// Optional: invalidate old sessions and issue a fresh one
	_, err = a.db.Exec(`DELETE FROM sessions WHERE user_id = ?`, userID)
	if err != nil {
		log.Printf("handleChangePassword: delete sessions error: %v", err)
		// not fatal; keep going
	}

	if err := a.setSessionCookie(w, userID); err != nil {
		log.Printf("handleChangePassword: setSessionCookie error: %v", err)
		// Still consider it mostly OK
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"ok": true,
	})
}

func (a *App) handleAdminResetPassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "use POST", http.StatusMethodNotAllowed)
		return
	}

	ct := r.Header.Get("Content-Type")
	if ct != "" && !strings.HasPrefix(ct, "application/json") {
		http.Error(w, "Content-Type must be application/json", http.StatusUnsupportedMediaType)
		return
	}

	var req adminResetPasswordRequest
	if err := decodeJSONBody(w, r, &req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	if req.Email == "" || req.NewPassword == "" {
		http.Error(w, "email and newPassword required", http.StatusBadRequest)
		return
	}

	if err := validatePassword(req.NewPassword); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Find user
	var userID int64
	err := a.db.QueryRow(`SELECT id FROM users WHERE email = ?`, req.Email).Scan(&userID)
	if err == sql.ErrNoRows {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("handleAdminResetPassword: DB error find user: %v", err)
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	// New hash
	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("handleAdminResetPassword: hash error: %v", err)
		http.Error(w, "hash error", http.StatusInternalServerError)
		return
	}

	// Update password
	// Update password AND clear lockout/failed attempts
	_, err = a.db.Exec(`
        UPDATE users 
        SET password_hash = ?, failed_attempts = 0, lockout_until = NULL 
        WHERE id = ?
    `, string(hash), userID)
	if err != nil {
		log.Printf("handleAdminResetPassword: update error: %v", err)
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	// Invalidate existing sessions for that user
	_, err = a.db.Exec(`DELETE FROM sessions WHERE user_id = ?`, userID)
	if err != nil {
		log.Printf("handleAdminResetPassword: delete sessions error: %v", err)
		// not fatal to the response, but log it
	}

	json.NewEncoder(w).Encode(map[string]any{
		"ok":     true,
		"userId": userID,
	})
}

/* ======================================================
   Middleware & Example Protected Endpoint
   ====================================================== */

func (a *App) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID, ok := a.getUserIDFromRequest(r)
		if !ok || userID == 0 {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		var isApprovedInt int
		if err := a.db.QueryRow(
			`SELECT is_approved FROM users WHERE id = ?`,
			userID,
		).Scan(&isApprovedInt); err != nil {
			log.Printf("requireAuth: DB error checking approval for user %d: %v", userID, err)
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		if isApprovedInt == 0 {
			// kill the session if they were unapproved after logging in
			a.clearSession(w, r)
			http.Error(w, "account pending approval", http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (a *App) handleProtectedTest(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]any{
		"ok":  true,
		"msg": "You are authenticated!",
	})
}

func ensureAdminUser(db *sql.DB, email string) error {
	if email == "" {
		return nil
	}

	// Extract username (before @)
	at := strings.Index(email, "@")
	if at < 0 {
		return nil // malformed email
	}
	prefix := email[:at]

	// Anyone whose prefix starts with "brcoldir" becomes admin
	if prefix != "brcoldir" {
		return nil
	}

	_, err := db.Exec(`UPDATE users SET is_admin = 1 WHERE email = ?`, email)
	return err
}

func (a *App) findOrCreateOktaUser(email string) (*User, error) {
	var u User
	var isAdminInt, isApprovedInt int

	err := a.db.QueryRow(`
        SELECT id, email, created_at, is_admin, is_approved
        FROM users
        WHERE email = ?
    `, email).Scan(&u.ID, &u.Email, &u.CreatedAt, &isAdminInt, &isApprovedInt)

	switch {
	case err == sql.ErrNoRows:
		// Create new user, auto-approved, not admin
		res, err := a.db.Exec(`
            INSERT INTO users (email, password_hash, is_admin, is_approved)
            VALUES (?, ?, 0, 1)
        `, email, "")
		if err != nil {
			return nil, err
		}
		id, _ := res.LastInsertId()

		// Re-query to populate CreatedAt etc.
		err = a.db.QueryRow(`
            SELECT id, email, created_at, is_admin, is_approved
            FROM users
            WHERE id = ?
        `, id).Scan(&u.ID, &u.Email, &u.CreatedAt, &isAdminInt, &isApprovedInt)
		if err != nil {
			return nil, err
		}

	case err != nil:
		return nil, err
	}

	u.IsAdmin = isAdminInt == 1
	u.IsApproved = isApprovedInt == 1
	return &u, nil
}

func emailFromIDToken(rawIDToken string) (string, error) {
	parts := strings.Split(rawIDToken, ".")
	if len(parts) < 2 {
		return "", fmt.Errorf("invalid JWT")
	}

	payload := parts[1]

	// Fix base64 padding
	switch len(payload) % 4 {
	case 2:
		payload += "=="
	case 3:
		payload += "="
	case 1:
		payload += "==="
	}

	decoded, err := base64.URLEncoding.DecodeString(payload)
	if err != nil {
		return "", err
	}

	var claims struct {
		Email string `json:"email"`
	}
	if err := json.Unmarshal(decoded, &claims); err != nil {
		return "", err
	}
	if claims.Email == "" {
		return "", fmt.Errorf("missing email claim")
	}
	return claims.Email, nil
}

// Map text tokens in the prompt to your column preset keys
// (must match keys in columnPresets in script.js).
// Map text tokens in the prompt to your column preset keys
func guessPresetFromToken(tok string) string {
	t := strings.ToLower(strings.TrimSpace(tok))

	switch {
	case strings.Contains(t, "score") || strings.Contains(t, "number") || strings.Contains(t, "int"):
		return "score_input"
	case strings.Contains(t, "status") || strings.Contains(t, "state"):
		return "status"
	case strings.Contains(t, "result") || strings.Contains(t, "calc") || strings.Contains(t, "output"):
		return "result"
	case strings.Contains(t, "text") || strings.Contains(t, "string") || strings.Contains(t, "input"):
		return "text_input"
	default:
		// Default to text input if unknown
		return "text_input"
	}
}

// Map preset -> column id string used in the UI (matches columnPresets)
func presetIDForPreset(preset string) string {
	switch preset {
	case "text_input":
		return "Text"
	case "score_input":
		return "Score"
	case "status":
		return "Status"
	case "result":
		return "Result"
	default:
		return preset
	}
}

type AISuggestRequest struct {
	Prompt   string          `json:"prompt"`
	Protocol json.RawMessage `json:"protocol"` // we can inspect this later if needed
}

type ColumnRef struct {
	ByID    string `json:"byId,omitempty"`
	ByName  string `json:"byName,omitempty"`
	ByIndex *int   `json:"byIndex,omitempty"`
}

type AIAction struct {
	Type string `json:"type"`

	// Existing addColumn fields
	Preset   string `json:"preset,omitempty"`
	Position string `json:"position,omitempty"`
	TargetID string `json:"targetId,omitempty"` // legacy single-id target

	// Generic targeting for columns (used by removeColumn, reorderColumn, updateColumn)
	Target   *ColumnRef `json:"target,omitempty"`
	Index    *int       `json:"index,omitempty"`    // optional index
	NewIndex *int       `json:"newIndex,omitempty"` // for reorderColumn

	// For setColumns / setScoringConfigs
	Columns        []AIColumnSpec        `json:"columns,omitempty"`
	ScoringConfigs []AIScoringConfigSpec `json:"scoringConfigs,omitempty"`

	// 🔹 NEW: arbitrary changes blob for updateColumn
	Changes map[string]any `json:"changes,omitempty"`

	// Template + protocol meta + save/load helpers
	TemplateKey   string `json:"templateKey,omitempty"`   // applyTemplate
	Name          string `json:"name,omitempty"`          // setProtocolMeta/saveProtocol
	ProtocolID    *int64 `json:"protocolId,omitempty"`    // setProtocolMeta
	VersionNumber *int   `json:"versionNumber,omitempty"` // setProtocolMeta

	// 🔹 CHANGED: Use interface{} to allow string (Column ID) OR int (Database ID)
	ID interface{} `json:"id,omitempty"`
}

type AISuggestResponse struct {
	Actions []AIAction `json:"actions"`
}

func (a *App) handleAISuggest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 1. Identify User
	userID, ok := a.getUserIDFromRequest(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// 2. Check Usage Limit (Limit: 25)
	var usage int
	err := a.db.QueryRow(`SELECT ai_usage_count FROM users WHERE id = ?`, userID).Scan(&usage)
	if err != nil {
		log.Printf("AI usage check failed: %v", err)
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	if usage >= 25 {
		http.Error(w, "Demo limit reached (25 requests max per account).", http.StatusTooManyRequests)
		return
	}

	// ... [Existing JSON decoding and validation code] ...

	var req AISuggestRequest
	if err := decodeJSONBody(w, r, &req); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	// ... [Prompt validation logic] ...

	apiKey := os.Getenv("GEMINI_API_KEY")
	// ... [API Key check] ...

	// 3. Call Gemini
	ctx := r.Context()
	aiResp, _, err := callGeminiForAISuggest(ctx, apiKey, req.Prompt, req.Protocol) // use req.Prompt here
	if err != nil {
		log.Printf("AI /api/ai/suggest Gemini error: %v", err)
		http.Error(w, "AI error", http.StatusInternalServerError)
		return
	}

	// 4. Increment Usage Count (Only on success)
	_, _ = a.db.Exec(`UPDATE users SET ai_usage_count = ai_usage_count + 1 WHERE id = ?`, userID)

	// 5. Respond
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(aiResp)
}

// Extra AI structures for richer actions

type AIColumnSpec struct {
	Preset string `json:"preset,omitempty"`
	ID     string `json:"id,omitempty"`
	Name   string `json:"name,omitempty"`
	Abbr   string `json:"abbr,omitempty"`
}

type AIConditionSpec struct {
	Col    string `json:"col"`
	Op     string `json:"op"`
	Thresh string `json:"thresh"`
	Base   string `json:"base"` // "zero" | "negative" | "positive"
}

type AIUpdateSpec struct {
	Col string `json:"col"`
	Val string `json:"val"`
}

type AIRuleSpec struct {
	Conditions []AIConditionSpec `json:"conditions"`
	Updates    []AIUpdateSpec    `json:"updates"`
}

type AIScoringConfigSpec struct {
	TriggerColumn   string       `json:"triggerColumn"`
	Scope           string       `json:"scope"` // "neither" | "positive" | "negative"
	RequireNegative bool         `json:"requireNegative"`
	RequirePositive bool         `json:"requirePositive"`
	Rules           []AIRuleSpec `json:"rules"`
}

// ---------------- Gemini integration for /api/ai/suggest ----------------

type geminiPart struct {
	Text string `json:"text,omitempty"`
}

type geminiContent struct {
	Role  string       `json:"role,omitempty"`
	Parts []geminiPart `json:"parts,omitempty"`
}

type geminiSystemInstruction struct {
	Parts []geminiPart `json:"parts"`
}

type geminiGenerationConfig struct {
	ResponseMimeType string `json:"response_mime_type,omitempty"`
}

type geminiRequest struct {
	Contents          []geminiContent          `json:"contents"`
	SystemInstruction *geminiSystemInstruction `json:"system_instruction,omitempty"`
	GenerationConfig  *geminiGenerationConfig  `json:"generationConfig,omitempty"`
}

// This is the one that was "undefined"
type geminiGenerateContentResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
}

// callGeminiForAISuggest sends the user's prompt + current protocol JSON to Gemini
// and expects back a JSON object that matches AISuggestResponse.
func callGeminiForAISuggest(
	ctx context.Context,
	apiKey string,
	prompt string,
	protocol json.RawMessage,
) (*AISuggestResponse, string, error) {
	if apiKey == "" {
		return nil, "", fmt.Errorf("no GEMINI_API_KEY configured")
	}

	// Same system prompt you used for OpenAI:
	// Updated generic system prompt
	// Updated system prompt with Preset instructions
	// Updated system prompt with Scoring instructions
	// Updated system prompt with ID generation rules
	systemPrompt := `
You are a configuration assistant for LogicGrid, a dynamic rule engine UI.

Your ONLY job is to convert natural language into a JSON object with this structure:

{
  "actions": [
    {
      "type": "addColumn" | "removeColumn" | "reorderColumn" | "updateColumn" |
              "setColumns" | "setScoringConfigs" | "applyTemplate" |
              "setProtocolMeta" | "saveProtocol" | "loadProtocol" | "noop",
      
      // FOR addColumn:
      "preset": "text_input" | "score_input" | "status" | "result",
      "name": "Custom Name", 
      "id": "CustomID",      // ALWAYS send "id" if "name" is present.

      // FOR setScoringConfigs:
      "scoringConfigs": [
        {
          "triggerColumn": "NameOfColumnThatTriggersRule",
          "scope": "neither" | "positive" | "negative",
          "rules": [
            {
              "conditions": [
                { "col": "ColName", "op": ">" | "<" | "==" | "!=" | ">=" | "<=", "thresh": "5", "base": "zero" }
              ],
              "updates": [
                { "col": "TargetCol", "val": "NewValue" }
              ]
            }
          ]
        }
      ]
    }
  ]
}

IMPORTANT RULES:
1. For "addColumn":
   - IF the user specifies a name, you MUST include both "name" AND "id".
   - "id" should be the name with spaces removed (e.g. "Awesome Column" -> "AwesomeColumn").
   - Example: "Add an awesome column" -> { "type": "addColumn", "preset": "text_input", "name": "Awesome", "id": "Awesome" }
   - Example: "Add a score column" -> { "type": "addColumn", "preset": "score_input" } (Use defaults if no name specified)

2. For Scoring Rules ("If X > 5 then Y = 10"):
   - Use "type": "setScoringConfigs".
   - You MUST include ALL existing scoring configs from the "Current protocol JSON" if you want to keep them, plus your new one.
   - If the rule mentions a column that does not exist in the current protocol, ALSO generate an "addColumn" action for it (before the scoring action).
   - "op" must be one of: ">", ">=", "<", "<=", "==", "!=", "always".
   - "base" defaults to "zero". Use "negative" or "positive" if comparing to a control.

3. Preset Mappings:
   - "score", "int", "number" -> "score_input"
   - "text", "string", "notes", "comment" -> "text_input"
   - "dropdown", "status", "state" -> "status"
   - "calc", "result", "output" -> "result"

4. NEVER include explanations.
`

	// Combine protocol JSON + user instruction into a single user message
	combinedUser := fmt.Sprintf(
		"Current protocol JSON:\n%s\n\nUser request:\n%s\n\nReturn ONLY a JSON object that matches the AISuggestResponse schema.",
		string(protocol),
		prompt,
	)

	gReq := geminiRequest{
		Contents: []geminiContent{
			{
				Role: "user",
				Parts: []geminiPart{
					{Text: combinedUser},
				},
			},
		},
		SystemInstruction: &geminiSystemInstruction{
			Parts: []geminiPart{
				{Text: systemPrompt},
			},
		},
		// 🔹 CHANGED: Move ResponseMimeType into GenerationConfig
		GenerationConfig: &geminiGenerationConfig{
			ResponseMimeType: "application/json",
		},
	}

	payload, err := json.Marshal(&gReq)

	// ... (rest of function remains the same)
	if err != nil {
		return nil, "", fmt.Errorf("marshal gemini request: %w", err)
	}

	endpoint := "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
		url.QueryEscape(apiKey)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))

	if err != nil {
		return nil, "", fmt.Errorf("create gemini request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("call gemini: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", fmt.Errorf("read gemini response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("gemini non-200: %d body=%s", resp.StatusCode, string(body))
	}

	var gResp geminiGenerateContentResponse
	if err := json.Unmarshal(body, &gResp); err != nil {
		return nil, "", fmt.Errorf("unmarshal gemini response: %w", err)
	}

	if len(gResp.Candidates) == 0 ||
		len(gResp.Candidates[0].Content.Parts) == 0 {
		// Treat as "no actions"
		return &AISuggestResponse{Actions: nil}, "", nil
	}

	rawContent := strings.TrimSpace(gResp.Candidates[0].Content.Parts[0].Text)
	if rawContent == "" {
		return &AISuggestResponse{Actions: nil}, "", nil
	}

	var aiResp AISuggestResponse
	if err := json.Unmarshal([]byte(rawContent), &aiResp); err != nil {
		return nil, rawContent, fmt.Errorf("unmarshal AISuggestResponse from gemini text: %w", err)
	}

	return &aiResp, rawContent, nil
}

var oktaOauthConfig *oauth2.Config

func init() {
	oktaDomain := os.Getenv("OKTA_DOMAIN") // this is actually your Auth0 domain, but name is fine
	oktaClientID := os.Getenv("OKTA_CLIENT_ID")
	oktaClientSecret := os.Getenv("OKTA_CLIENT_SECRET")
	redirect := os.Getenv("OKTA_REDIRECT_URI")

	oktaOauthConfig = &oauth2.Config{
		ClientID:     oktaClientID,
		ClientSecret: oktaClientSecret,
		RedirectURL:  redirect,
		Scopes:       []string{"openid", "email", "profile"},
		Endpoint: oauth2.Endpoint{
			AuthURL:  "https://" + oktaDomain + "/authorize",
			TokenURL: "https://" + oktaDomain + "/oauth/token",
		},
	}
}

// --- Okta login handlers ---

func (a *App) handleOktaLogin(w http.ResponseWriter, r *http.Request) {
	if oktaOauthConfig == nil || oktaOauthConfig.ClientID == "" {
		http.Error(w, "Okta not configured", http.StatusInternalServerError)
		return
	}

	state, err := a.generateSessionID()
	if err != nil {
		http.Error(w, "state error", http.StatusInternalServerError)
		return
	}

	setStateCookie(w, state)

	url := oktaOauthConfig.AuthCodeURL(state)
	http.Redirect(w, r, url, http.StatusFound)
}

func (a *App) handleOktaCallback(w http.ResponseWriter, r *http.Request) {
	state := r.URL.Query().Get("state")
	code := r.URL.Query().Get("code")

	if !validateStateCookie(r, state) {
		http.Error(w, "invalid state", http.StatusUnauthorized)
		return
	}

	token, err := oktaOauthConfig.Exchange(r.Context(), code)
	if err != nil {
		http.Error(w, "token exchange failed", http.StatusInternalServerError)
		return
	}

	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok {
		http.Error(w, "no id_token", http.StatusInternalServerError)
		return
	}

	email, err := emailFromIDToken(rawIDToken)
	if err != nil {
		http.Error(w, "failed to parse id_token", http.StatusInternalServerError)
		return
	}

	// Find or create the user in your users table
	user, err := a.findOrCreateOktaUser(email)
	if err != nil {
		log.Printf("handleOktaCallback: DB error: %v", err)
		http.Error(w, "DB error", http.StatusInternalServerError)
		return
	}

	// Reuse your existing session logic
	if err := a.setSessionCookie(w, user.ID); err != nil {
		log.Printf("handleOktaCallback: setSessionCookie error: %v", err)
		http.Error(w, "session error", http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, "/", http.StatusFound)
}

func (a *App) handleOktaLogout(w http.ResponseWriter, r *http.Request) {
	// Clear local session
	a.clearSession(w, r)

	oktaDomain := os.Getenv("OKTA_DOMAIN")
	if oktaDomain == "" {
		// If Okta not configured, just go home
		http.Redirect(w, r, "/", http.StatusFound)
		return
	}

	postLogout := "http://localhost:8080/" // change in prod if needed

	logoutURL := fmt.Sprintf(
		"https://%s/oauth2/default/v1/logout?post_logout_redirect_uri=%s",
		oktaDomain,
		url.QueryEscape(postLogout),
	)

	http.Redirect(w, r, logoutURL, http.StatusFound)
}

// --- Okta state cookie helpers ---

func setStateCookie(w http.ResponseWriter, state string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "okta_state",
		Value:    state,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   isProd(),
	})
}

func validateStateCookie(r *http.Request, state string) bool {
	if state == "" {
		return false
	}
	c, err := r.Cookie("okta_state")
	if err != nil || c.Value == "" {
		return false
	}
	return c.Value == state
}

func ensureColumnPresetsSeeded(db *sql.DB) error {
	presets := []struct {
		Key   string
		Label string
		JSON  string
		Order *int
	}{
		{
			Key:   "text_input",
			Label: "Text Input",
			JSON: `{
                "id": "Text",
                "name": "Text Input",
                "abbr": "Tx",
                "backgroundColor": "#FFFFFF",
                "allowInt": false,
                "allowStr": true,
                "strOptions": [],
                "tabBehavior": "nextRow",
                "useAsStartingDilution": false,
                "hasPositive": false,
                "showWhenPrescribing": false,
                "autoFillValue": "",
                "autoFillOverwrite": false
            }`,
			Order: intPtr(1),
		},
		{
			Key:   "score_input",
			Label: "Score Input",
			JSON: `{
                "id": "Score",
                "name": "Score",
                "abbr": "Sc",
                "backgroundColor": "#E0F0FF",
                "allowInt": true,
                "intMin": 0,
                "intMax": 10,
                "allowStr": false,
                "tabBehavior": "nextColumn",
                "useAsStartingDilution": false,
                "hasPositive": false,
                "showWhenPrescribing": true, 
                "autoFillValue": "0",
                "autoFillOverwrite": false
            }`,
			Order: intPtr(2),
		},
		{
			Key:   "status",
			Label: "Status",
			JSON: `{
                "id": "Status",
                "name": "Status",
                "abbr": "St",
                "backgroundColor": "#FFFFE0",
                "allowInt": false,
                "allowStr": true,
                "strOptions": ["Pending", "Approved", "Rejected", "N/A"],
                "tabBehavior": "nextRow",
                "useAsStartingDilution": false,
                "hasPositive": false,
                "showWhenPrescribing": false,
                "autoFillValue": "Pending",
                "autoFillOverwrite": true
            }`,
			Order: intPtr(3),
		},
		{
			Key:   "result",
			Label: "Result",
			JSON: `{
                "id": "Result",
                "name": "Result",
                "abbr": "Res",
                "backgroundColor": "#DDDDDD",
                "allowInt": true,
                "intMin": 0,
                "intMax": 100,
                "allowStr": true,
                "strOptions": ["Pass", "Fail"],
                "tabBehavior": "nextRow",
                "useAsStartingDilution": false,
                "hasPositive": false,
                "showWhenPrescribing": true,
                "autoFillValue": "",
                "autoFillOverwrite": false
            }`,
			Order: intPtr(4),
		},
	}

	for _, p := range presets {
		// We use INSERT OR REPLACE (via ON CONFLICT DO UPDATE) to ensure
		// that if the key exists, the generic config overwrites the old medical config.
		_, err := db.Exec(`
            INSERT INTO column_presets (preset_key, label, config_json, standard_order)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(preset_key) DO UPDATE SET
                label = excluded.label,
                config_json = excluded.config_json,
                standard_order = excluded.standard_order
        `, p.Key, p.Label, p.JSON, p.Order)
		if err != nil {
			return err
		}
	}

	// Optional: Clean up old medical presets if they exist in the DB
	// This ensures a clean slate for LogicGrid.
	oldKeys := []string{"prick", "flare", "id", "idf", "idconc", "dil", "ep", "epPlus2", "score"}
	for _, k := range oldKeys {
		_, _ = db.Exec(`DELETE FROM column_presets WHERE preset_key = ?`, k)
	}

	return nil
}

func intPtr(v int) *int { return &v }

type ColumnPresetDTO struct {
	Key           string          `json:"key"`
	Label         string          `json:"label"`
	Config        json.RawMessage `json:"config"`
	StandardOrder *int            `json:"standardOrder,omitempty"`
}

func (a *App) handleColumnPresets(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		// List all presets (any logged-in user; route is already wrapped in requireAuth)
		rows, err := a.db.Query(`
			SELECT preset_key, label, config_json, standard_order
			FROM column_presets
			ORDER BY COALESCE(standard_order, 9999), preset_key
		`)
		if err != nil {
			log.Println("column_presets select error:", err)
			http.Error(w, "db error", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var out []ColumnPresetDTO

		for rows.Next() {
			var key, label string
			var config []byte
			var standardOrder sql.NullInt64

			if err := rows.Scan(&key, &label, &config, &standardOrder); err != nil {
				log.Println("column_presets scan error:", err)
				http.Error(w, "scan error", http.StatusInternalServerError)
				return
			}

			dto := ColumnPresetDTO{
				Key:   key,
				Label: label,
				// Store raw JSON exactly as in DB
				Config: json.RawMessage(config),
			}
			if standardOrder.Valid {
				v := int(standardOrder.Int64)
				dto.StandardOrder = &v
			}

			out = append(out, dto)
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(out); err != nil {
			log.Println("column_presets encode error:", err)
			http.Error(w, "encode error", http.StatusInternalServerError)
			return
		}

	case http.MethodPost:
		// Create or update a preset (any logged-in user)
		var payload ColumnPresetDTO
		if err := decodeJSONBody(w, r, &payload); err != nil {
			log.Println("column_presets decode error:", err)
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		payload.Key = strings.TrimSpace(payload.Key)
		payload.Label = strings.TrimSpace(payload.Label)

		if payload.Key == "" || payload.Label == "" || len(payload.Config) == 0 {
			http.Error(w, "key, label, and config are required", http.StatusBadRequest)
			return
		}

		// Upsert by preset_key
		_, err := a.db.Exec(`
			INSERT INTO column_presets (preset_key, label, config_json, standard_order)
			VALUES (?, ?, ?, ?)
			ON CONFLICT(preset_key) DO UPDATE SET
				label = excluded.label,
				config_json = excluded.config_json,
				standard_order = excluded.standard_order
		`,
			payload.Key,
			payload.Label,
			string(payload.Config),
			payload.StandardOrder,
		)
		if err != nil {
			log.Println("column_presets upsert error:", err)
			http.Error(w, "db error", http.StatusInternalServerError)
			return
		}

		// No body needed; JS just checks success
		w.WriteHeader(http.StatusNoContent)

	case http.MethodDelete:
		// DELETE is admin-only
		userID, ok := a.getUserIDFromRequest(r)
		if !ok || userID == 0 {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		var isAdminInt int
		if err := a.db.QueryRow(`SELECT is_admin FROM users WHERE id = ?`, userID).Scan(&isAdminInt); err != nil {
			log.Println("column_presets admin check error:", err)
			http.Error(w, "db error", http.StatusInternalServerError)
			return
		}
		if isAdminInt == 0 {
			http.Error(w, "forbidden - admin only", http.StatusForbidden)
			return
		}

		key := strings.TrimSpace(r.URL.Query().Get("key"))
		if key == "" {
			http.Error(w, "missing key", http.StatusBadRequest)
			return
		}

		if _, err := a.db.Exec(`DELETE FROM column_presets WHERE preset_key = ?`, key); err != nil {
			log.Println("column_presets delete error:", err)
			http.Error(w, "db error", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}
