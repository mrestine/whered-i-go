package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	rdb "github.com/mrestine/whered-i-go/pkg/redis"
	"github.com/mrestine/whered-i-go/pkg/session"
	"github.com/mrestine/whered-i-go/pkg/strava"
	"github.com/mrestine/whered-i-go/pkg/types"
)

const activityTTL = 30 * 24 * 60 * 60 // 30 days in seconds

func Handler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	user, err := session.GetSession(r.Header.Get("Cookie"))
	if err != nil || user == nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{"rides": nil})
		return
	}

	// Vercel injects the dynamic segment as ?id= via the rewrite rule.
	// Fall back to path extraction for local dev.
	id := r.URL.Query().Get("id")
	if id == "" {
		path := strings.TrimSuffix(r.URL.Path, "/")
		parts := strings.Split(path, "/")
		last := parts[len(parts)-1]
		if last != "" && last != "rides" {
			id = last
		}
	}

	if id != "" {
		handleSingleRide(w, r, user, id)
		return
	}

	handleRideList(w, r, user)
}

// handleRideList returns the list of recent rides for the authenticated user.
func handleRideList(w http.ResponseWriter, _ *http.Request, user *types.User) {
	ridesKey := fmt.Sprintf("wdig:rides:%d", user.StravaAthleteID)
	actIDs, err := rdb.ZRevRange(ridesKey, 0, 4)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"rides": []types.ActivityMeta{}, "debug_zrevrange_err": err.Error()})
		return
	}

	if len(actIDs) == 0 {
		// No rides in Redis yet — backfill from Strava.
		fetched, ferr := strava.FetchRecentOutdoorActivities(user.StravaAthleteID, 5)
		if ferr != nil || len(fetched) == 0 {
			errStr := ""
			if ferr != nil {
				errStr = ferr.Error()
			}
			json.NewEncoder(w).Encode(map[string]interface{}{"rides": []types.ActivityMeta{}, "debug_error": errStr})
			return
		}
		for _, meta := range fetched {
			data, merr := json.Marshal(meta)
			if merr != nil {
				continue
			}
			metaKey := fmt.Sprintf("wdig:activity:%d:meta", meta.ActivityID)
			_ = rdb.Set(metaKey, string(data), activityTTL)

			t, terr := time.Parse("2006-01-02T15:04:05", meta.StartDate)
			if terr != nil {
				t = time.Now()
			}
			_ = rdb.ZAdd(ridesKey, float64(t.UnixMilli()), strconv.FormatInt(meta.ActivityID, 10))
		}
		_ = rdb.Expire(ridesKey, activityTTL)

		json.NewEncoder(w).Encode(map[string]interface{}{"rides": fetched, "debug_backfill_count": len(fetched)})
		return
	}

	// Fetch all meta keys in one batch.
	metaKeys := make([]string, len(actIDs))
	for i, id := range actIDs {
		metaKeys[i] = fmt.Sprintf("wdig:activity:%s:meta", id)
	}

	values, err := rdb.MGet(metaKeys...)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "failed to fetch rides"})
		return
	}

	ridesKey2 := fmt.Sprintf("wdig:rides:%d", user.StravaAthleteID)
	rides := make([]types.ActivityMeta, 0, len(actIDs))
	for i, val := range values {
		if val == "" {
			_ = rdb.ZRem(ridesKey2, actIDs[i])
			continue
		}
		var meta types.ActivityMeta
		if err := json.Unmarshal([]byte(val), &meta); err != nil {
			continue
		}
		rides = append(rides, meta)
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"rides": rides, "debug_from_redis": actIDs})
}

// handleSingleRide returns the GPS stream for a single ride.
func handleSingleRide(w http.ResponseWriter, _ *http.Request, user *types.User, id string) {
	metaKey := fmt.Sprintf("wdig:activity:%s:meta", id)
	metaVal, err := rdb.Get(metaKey)
	if err != nil || metaVal == "" {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "not found"})
		return
	}

	var meta types.ActivityMeta
	if err := json.Unmarshal([]byte(metaVal), &meta); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "parse error"})
		return
	}

	if meta.AthleteID != user.StravaAthleteID {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"error": "forbidden"})
		return
	}

	streamKey := fmt.Sprintf("wdig:activity:%s:stream", id)
	streamVal, err := rdb.Get(streamKey)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "redis error"})
		return
	}

	var points [][2]float64
	if streamVal == "" {
		fetched, ferr := strava.FetchActivityStream(user.StravaAthleteID, meta.ActivityID)
		if ferr != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to fetch stream"})
			return
		}
		if len(fetched) == 0 {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "stream not found"})
			return
		}
		data, merr := json.Marshal(fetched)
		if merr == nil {
			_ = rdb.Set(streamKey, string(data), activityTTL)
		}
		points = fetched
	} else {
		if err := json.Unmarshal([]byte(streamVal), &points); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "parse error"})
			return
		}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"points": points})
}
