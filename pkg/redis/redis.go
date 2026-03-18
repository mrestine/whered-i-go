package redis

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
)

func baseURL() string {
	return os.Getenv("REDIS_URL")
}

func token() string {
	return os.Getenv("REDIS_TOKEN")
}

// do sends a single Redis command as a JSON array body to the REST endpoint.
// Format: POST {url}  body: ["COMMAND", "arg1", "arg2", ...]
func do(args ...interface{}) (json.RawMessage, error) {
	payload, err := json.Marshal(args)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", baseURL(), bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token())
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var envelope struct {
		Result json.RawMessage `json:"result"`
		Error  string          `json:"error"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		return nil, fmt.Errorf("redis: parse error: %w (body: %s)", err, body)
	}
	if envelope.Error != "" {
		return nil, fmt.Errorf("redis: %s", envelope.Error)
	}
	return envelope.Result, nil
}

// Set stores a string value with an optional TTL in seconds (0 = no expiry).
func Set(key, value string, exSeconds int) error {
	var err error
	if exSeconds > 0 {
		_, err = do("SET", key, value, "EX", strconv.Itoa(exSeconds))
	} else {
		_, err = do("SET", key, value)
	}
	return err
}

// Get retrieves a string value. Returns ("", nil) if the key does not exist.
func Get(key string) (string, error) {
	result, err := do("GET", key)
	if err != nil {
		return "", err
	}
	if string(result) == "null" {
		return "", nil
	}
	var s string
	if err := json.Unmarshal(result, &s); err != nil {
		return "", err
	}
	return s, nil
}

// Del deletes one key.
func Del(key string) error {
	_, err := do("DEL", key)
	return err
}

// ZAdd adds a member with a score to a sorted set.
func ZAdd(key string, score float64, member string) error {
	_, err := do("ZADD", key, strconv.FormatFloat(score, 'f', -1, 64), member)
	return err
}

// ZRevRange returns members from a sorted set, highest score first.
func ZRevRange(key string, start, stop int) ([]string, error) {
	result, err := do("ZREVRANGE", key, strconv.Itoa(start), strconv.Itoa(stop))
	if err != nil {
		return nil, err
	}
	var members []string
	if err := json.Unmarshal(result, &members); err != nil {
		return nil, err
	}
	return members, nil
}

// MGet retrieves multiple keys in a single pipeline request.
// Returns a slice of the same length; entries are "" for missing keys.
func MGet(keys ...string) ([]string, error) {
	type cmd []interface{}
	commands := make([]cmd, len(keys))
	for i, k := range keys {
		commands[i] = cmd{"GET", k}
	}

	payload, err := json.Marshal(commands)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", baseURL()+"/pipeline", strings.NewReader(string(payload)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token())
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var results []struct {
		Result json.RawMessage `json:"result"`
		Error  string          `json:"error"`
	}
	if err := json.Unmarshal(body, &results); err != nil {
		return nil, fmt.Errorf("redis pipeline: parse error: %w (body: %s)", err, body)
	}

	values := make([]string, len(keys))
	for i, r := range results {
		if r.Error != "" || string(r.Result) == "null" {
			values[i] = ""
			continue
		}
		var s string
		if err := json.Unmarshal(r.Result, &s); err != nil {
			values[i] = ""
			continue
		}
		values[i] = s
	}
	return values, nil
}

// Expire sets a TTL (in seconds) on an existing key.
func Expire(key string, seconds int) error {
	_, err := do("EXPIRE", key, strconv.Itoa(seconds))
	return err
}

// ZRem removes a member from a sorted set.
func ZRem(key, member string) error {
	_, err := do("ZREM", key, member)
	return err
}

// ZRemRangeByRank removes members in a sorted set within the given rank range.
// Use start=0, stop=-6 to trim to the newest 5 entries.
func ZRemRangeByRank(key string, start, stop int) error {
	_, err := do("ZREMRANGEBYRANK", key, strconv.Itoa(start), strconv.Itoa(stop))
	return err
}
