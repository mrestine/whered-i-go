package handler

import (
	"encoding/json"
	"net/http"

	"github.com/mrestine/whered-i-go/pkg/session"
)

func Handler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	user, err := session.GetSession(r.Header.Get("Cookie"))
	if err != nil || user == nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{"user": nil})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"user": user})
}
