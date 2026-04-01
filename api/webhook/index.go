package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	rdb "github.com/mrestine/whered-i-go/pkg/redis"
	"github.com/mrestine/whered-i-go/pkg/strava"
)

const activityTTL = 30 * 24 * 60 * 60 // 30 days in seconds

func Handler(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		mode := r.URL.Query().Get("hub.mode")
		token := r.URL.Query().Get("hub.verify_token")
		challenge := r.URL.Query().Get("hub.challenge")
		if mode == "subscribe" && token == os.Getenv("STRAVA_WEBHOOK_VERIFY_TOKEN") {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{"hub.challenge": challenge})
		} else {
			http.Error(w, "forbidden", http.StatusForbidden)
		}
		return
	}

	if r.Method != "POST" {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var event struct {
		ObjectType string `json:"object_type"`
		AspectType string `json:"aspect_type"`
		OwnerID    int64  `json:"owner_id"`
		ObjectID   int64  `json:"object_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	// Handle delete events.
	if event.AspectType == "delete" && event.ObjectType == "activity" {
		metaKey := fmt.Sprintf("wdig:activity:%d:meta", event.ObjectID)
		streamKey := fmt.Sprintf("wdig:activity:%d:stream", event.ObjectID)
		ridesKey := fmt.Sprintf("wdig:rides:%d", event.OwnerID)
		_ = rdb.Del(metaKey)
		_ = rdb.Del(streamKey)
		_ = rdb.ZRem(ridesKey, fmt.Sprintf("%d", event.ObjectID))
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]bool{"received": true})
		return
	}

	// Handle update events (e.g. rename, crop).
	if event.AspectType == "update" && event.ObjectType == "activity" {
		metaKey := fmt.Sprintf("wdig:activity:%d:meta", event.ObjectID)
		streamKey := fmt.Sprintf("wdig:activity:%d:stream", event.ObjectID)
		ridesKey := fmt.Sprintf("wdig:rides:%d", event.OwnerID)

		meta, err := strava.FetchActivityMeta(event.OwnerID, event.ObjectID)
		if err != nil || meta == nil {
			w.WriteHeader(http.StatusOK)
			return
		}

		// If the activity was updated to virtual/trainer, remove it.
		if meta.SportType == "VirtualRide" || meta.Trainer {
			_ = rdb.Del(metaKey)
			_ = rdb.Del(streamKey)
			_ = rdb.ZRem(ridesKey, fmt.Sprintf("%d", event.ObjectID))
			w.WriteHeader(http.StatusOK)
			return
		}

		// Re-fetch stream in case the activity was cropped.
		stream, err := strava.FetchActivityStream(event.OwnerID, event.ObjectID)
		if err != nil || len(stream) == 0 {
			w.WriteHeader(http.StatusOK)
			return
		}

		streamJSON, err := json.Marshal(stream)
		if err != nil {
			w.WriteHeader(http.StatusOK)
			return
		}
		if err := rdb.Set(streamKey, string(streamJSON), activityTTL); err != nil {
			w.WriteHeader(http.StatusOK)
			return
		}

		metaJSON, err := json.Marshal(meta)
		if err != nil {
			w.WriteHeader(http.StatusOK)
			return
		}
		_ = rdb.Set(metaKey, string(metaJSON), activityTTL)

		// Re-add to sorted set in case it was removed by a prior delete event.
		startTime, _ := time.Parse("2006-01-02T15:04:05", meta.StartDate)
		score := float64(startTime.UnixMilli())
		_ = rdb.ZAdd(ridesKey, score, fmt.Sprintf("%d", event.ObjectID))
		_ = rdb.Expire(ridesKey, activityTTL)
		_ = rdb.ZRemRangeByRank(ridesKey, 0, -6)

		w.WriteHeader(http.StatusOK)
		return
	}

	// Only handle activity create events.
	if event.ObjectType != "activity" || event.AspectType != "create" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// Fetch activity metadata first so we can filter before any Redis writes.
	meta, err := strava.FetchActivityMeta(event.OwnerID, event.ObjectID)
	if err != nil || meta == nil {
		w.WriteHeader(http.StatusOK)
		return
	}

	// Skip virtual and trainer rides.
	if meta.SportType == "VirtualRide" || meta.Trainer {
		w.WriteHeader(http.StatusOK)
		return
	}

	// Fetch stream from Strava.
	stream, err := strava.FetchActivityStream(event.OwnerID, event.ObjectID)
	if err != nil || len(stream) == 0 {
		w.WriteHeader(http.StatusOK)
		return
	}

	// Marshal and store stream.
	streamJSON, err := json.Marshal(stream)
	if err != nil {
		w.WriteHeader(http.StatusOK)
		return
	}
	streamKey := fmt.Sprintf("wdig:activity:%d:stream", event.ObjectID)
	if err := rdb.Set(streamKey, string(streamJSON), activityTTL); err != nil {
		w.WriteHeader(http.StatusOK)
		return
	}

	// Marshal and store meta.
	metaJSON, err := json.Marshal(meta)
	if err != nil {
		w.WriteHeader(http.StatusOK)
		return
	}
	metaKey := fmt.Sprintf("wdig:activity:%d:meta", event.ObjectID)
	if err := rdb.Set(metaKey, string(metaJSON), activityTTL); err != nil {
		w.WriteHeader(http.StatusOK)
		return
	}

	// Add to athlete's rides sorted set (score = start timestamp in ms).
	ridesKey := fmt.Sprintf("wdig:rides:%d", event.OwnerID)
	startTime, _ := time.Parse("2006-01-02T15:04:05", meta.StartDate)
	score := float64(startTime.UnixMilli())
	actIDStr := fmt.Sprintf("%d", event.ObjectID)
	if err := rdb.ZAdd(ridesKey, score, actIDStr); err != nil {
		w.WriteHeader(http.StatusOK)
		return
	}
	_ = rdb.Expire(ridesKey, activityTTL)

	// Trim to newest 5.
	_ = rdb.ZRemRangeByRank(ridesKey, 0, -6)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]bool{"received": true})
}
