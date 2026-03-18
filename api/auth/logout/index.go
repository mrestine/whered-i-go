package handler

import (
	"net/http"

	"github.com/mrestine/whered-i-go/pkg/session"
)

func Handler(w http.ResponseWriter, r *http.Request) {
	_ = session.DeleteSession(r.Header.Get("Cookie"))
	w.Header().Set("Set-Cookie", session.SessionCookieHeader("", 0))
	http.Redirect(w, r, "/", http.StatusTemporaryRedirect)
}
