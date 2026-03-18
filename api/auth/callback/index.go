package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/mrestine/whered-i-go/pkg/redis"
	"github.com/mrestine/whered-i-go/pkg/session"
	"github.com/mrestine/whered-i-go/pkg/types"
)

const callbackTokenTTL = 90 * 24 * 60 * 60 // 90 days in seconds

func Handler(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	if code == "" {
		http.Redirect(w, r, "/?auth=error", http.StatusTemporaryRedirect)
		return
	}

	// Exchange code for tokens.
	form := url.Values{}
	form.Set("client_id", os.Getenv("STRAVA_CLIENT_ID"))
	form.Set("client_secret", os.Getenv("STRAVA_CLIENT_SECRET"))
	form.Set("code", code)
	form.Set("grant_type", "authorization_code")

	resp, err := http.PostForm("https://www.strava.com/oauth/token", form)
	if err != nil {
		log.Printf("callback: token exchange request failed: %v", err)
		http.Redirect(w, r, "/?auth=error", http.StatusTemporaryRedirect)
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("callback: read body failed: %v", err)
		http.Redirect(w, r, "/?auth=error", http.StatusTemporaryRedirect)
		return
	}

	if resp.StatusCode != 200 {
		log.Printf("callback: strava returned %d: %s", resp.StatusCode, body)
		http.Redirect(w, r, "/?auth=error", http.StatusTemporaryRedirect)
		return
	}

	var result struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresAt    int64  `json:"expires_at"`
		Athlete      struct {
			ID        int64  `json:"id"`
			Firstname string `json:"firstname"`
			Lastname  string `json:"lastname"`
			Profile   string `json:"profile"`
		} `json:"athlete"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		log.Printf("callback: unmarshal failed: %v — body: %s", err, body)
		http.Redirect(w, r, "/?auth=error", http.StatusTemporaryRedirect)
		return
	}

	// Store tokens in Redis.
	tokens := types.StoredTokens{
		AccessToken:  result.AccessToken,
		RefreshToken: result.RefreshToken,
		ExpiresAt:    result.ExpiresAt,
	}
	tokensJSON, err := json.Marshal(tokens)
	if err != nil {
		log.Printf("callback: marshal tokens failed: %v", err)
		http.Redirect(w, r, "/?auth=error", http.StatusTemporaryRedirect)
		return
	}
	tokenKey := fmt.Sprintf("wdig:tokens:%d", result.Athlete.ID)
	if err := redis.Set(tokenKey, string(tokensJSON), callbackTokenTTL); err != nil {
		log.Printf("callback: redis set tokens failed: %v", err)
		http.Redirect(w, r, "/?auth=error", http.StatusTemporaryRedirect)
		return
	}

	// Create session.
	name := strings.TrimSpace(result.Athlete.Firstname + " " + result.Athlete.Lastname)
	user := types.User{
		StravaAthleteID: result.Athlete.ID,
		AthleteName:     name,
		AvatarURL:       result.Athlete.Profile,
	}
	token, err := session.CreateSession(user)
	if err != nil {
		log.Printf("callback: create session failed: %v", err)
		http.Redirect(w, r, "/?auth=error", http.StatusTemporaryRedirect)
		return
	}

	w.Header().Set("Set-Cookie", session.SessionCookieHeader(token, 7*24*60*60))
	http.Redirect(w, r, "/", http.StatusTemporaryRedirect)
}
