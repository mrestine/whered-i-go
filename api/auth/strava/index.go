package handler

import (
	"fmt"
	"net/http"
	"net/url"
	"os"
)

func Handler(w http.ResponseWriter, r *http.Request) {
	clientID := os.Getenv("STRAVA_CLIENT_ID")
	baseURL := os.Getenv("BASE_URL")
	redirectURI := baseURL + "/api/auth/callback"

	authURL := fmt.Sprintf(
		"https://www.strava.com/oauth/authorize?client_id=%s&redirect_uri=%s&response_type=code&approval_prompt=auto&scope=read,activity:read_all",
		clientID,
		url.QueryEscape(redirectURI),
	)
	http.Redirect(w, r, authURL, http.StatusTemporaryRedirect)
}
