package session

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"

	rdb "github.com/mrestine/whered-i-go/pkg/redis"
	"github.com/mrestine/whered-i-go/pkg/types"
)

const sessionTTL = 7 * 24 * 60 * 60 // 7 days in seconds

func sessionKey(token string) string {
	return "wdig:session:" + token
}

// GenerateToken returns a cryptographically random 32-byte hex string.
func GenerateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// CreateSession stores a user session in Redis and returns the session token.
func CreateSession(user types.User) (string, error) {
	token, err := GenerateToken()
	if err != nil {
		return "", err
	}

	data, err := json.Marshal(user)
	if err != nil {
		return "", err
	}

	if err := rdb.Set(sessionKey(token), string(data), sessionTTL); err != nil {
		return "", err
	}
	return token, nil
}

// GetSession parses the wdig_session cookie from the Cookie header and looks up the session.
// Returns nil, nil if the session does not exist.
func GetSession(cookieHeader string) (*types.User, error) {
	token := parseCookie(cookieHeader, "wdig_session")
	if token == "" {
		return nil, nil
	}

	val, err := rdb.Get(sessionKey(token))
	if err != nil {
		return nil, err
	}
	if val == "" {
		return nil, nil
	}

	var user types.User
	if err := json.Unmarshal([]byte(val), &user); err != nil {
		return nil, err
	}
	return &user, nil
}

// DeleteSession removes the session from Redis.
func DeleteSession(cookieHeader string) error {
	token := parseCookie(cookieHeader, "wdig_session")
	if token == "" {
		return nil
	}
	return rdb.Del(sessionKey(token))
}

// SessionCookieHeader returns the value for the Set-Cookie header.
func SessionCookieHeader(token string, maxAge int) string {
	return fmt.Sprintf("wdig_session=%s; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=%d", token, maxAge)
}

// parseCookie extracts a named cookie value from a Cookie header string.
func parseCookie(header, name string) string {
	for _, part := range strings.Split(header, ";") {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, name+"=") {
			return strings.TrimPrefix(part, name+"=")
		}
	}
	return ""
}
