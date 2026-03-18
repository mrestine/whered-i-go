package strava

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	rdb "github.com/mrestine/whered-i-go/pkg/redis"
	"github.com/mrestine/whered-i-go/pkg/types"
)

const tokenTTL = 90 * 24 * 60 * 60 // 90 days in seconds

func tokenKey(athleteID int64) string {
	return fmt.Sprintf("wdig:tokens:%d", athleteID)
}

// GetValidAccessToken returns a valid Strava access token for the given athlete,
// refreshing it if it expires within 5 minutes.
func GetValidAccessToken(athleteID int64) (string, error) {
	val, err := rdb.Get(tokenKey(athleteID))
	if err != nil {
		return "", err
	}
	if val == "" {
		return "", fmt.Errorf("no tokens stored for athlete %d", athleteID)
	}

	var stored types.StoredTokens
	if err := json.Unmarshal([]byte(val), &stored); err != nil {
		return "", err
	}

	// If token is still valid for more than 5 minutes, return it as-is.
	if stored.ExpiresAt-300 > time.Now().Unix() {
		return stored.AccessToken, nil
	}

	// Refresh the token.
	refreshed, err := refreshToken(stored.RefreshToken)
	if err != nil {
		return "", err
	}

	data, err := json.Marshal(refreshed)
	if err != nil {
		return "", err
	}
	if err := rdb.Set(tokenKey(athleteID), string(data), tokenTTL); err != nil {
		return "", err
	}
	return refreshed.AccessToken, nil
}

func refreshToken(refreshToken string) (*types.StoredTokens, error) {
	form := url.Values{}
	form.Set("client_id", os.Getenv("STRAVA_CLIENT_ID"))
	form.Set("client_secret", os.Getenv("STRAVA_CLIENT_SECRET"))
	form.Set("grant_type", "refresh_token")
	form.Set("refresh_token", refreshToken)

	resp, err := http.PostForm("https://www.strava.com/oauth/token", form)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var result struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresAt    int64  `json:"expires_at"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	return &types.StoredTokens{
		AccessToken:  result.AccessToken,
		RefreshToken: result.RefreshToken,
		ExpiresAt:    result.ExpiresAt,
	}, nil
}

// FetchActivityStream fetches the lat/lng stream for an activity.
// Returns nil, nil if the activity is private or deleted (403/404).
func FetchActivityStream(athleteID, activityID int64) ([][2]float64, error) {
	accessToken, err := GetValidAccessToken(athleteID)
	if err != nil {
		return nil, err
	}

	apiURL := fmt.Sprintf("https://www.strava.com/api/v3/activities/%d/streams?keys=latlng&key_by_type=true", activityID)
	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 403 || resp.StatusCode == 404 {
		return nil, nil
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("strava stream: unexpected status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var result struct {
		Latlng struct {
			Data [][2]float64 `json:"data"`
		} `json:"latlng"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	return result.Latlng.Data, nil
}

type stravaActivity struct {
	ID             int64   `json:"id"`
	Name           string  `json:"name"`
	StartDate      string  `json:"start_date"` // UTC, used for before= pagination
	StartDateLocal string  `json:"start_date_local"`
	Distance       float64 `json:"distance"`
	SportType      string  `json:"sport_type"`
	Trainer        bool    `json:"trainer"`
}

func fetchActivitiesPage(accessToken string, perPage int, before int64) ([]stravaActivity, error) {
	apiURL := fmt.Sprintf("https://www.strava.com/api/v3/athlete/activities?per_page=%d&page=1", perPage)
	if before > 0 {
		apiURL += fmt.Sprintf("&before=%d", before)
	}
	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("strava activities: unexpected status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var activities []stravaActivity
	if err := json.Unmarshal(body, &activities); err != nil {
		return nil, err
	}
	return activities, nil
}

func toMeta(a stravaActivity, athleteID int64) types.ActivityMeta {
	return types.ActivityMeta{
		ActivityID:     a.ID,
		AthleteID:      athleteID,
		Name:           a.Name,
		StartDate:      strings.TrimSuffix(a.StartDateLocal, "Z"),
		DistanceMeters: a.Distance,
	}
}

// FetchRecentOutdoorActivities fetches the most recent non-virtual, non-trainer
// activities for the given athlete and returns up to limit results.
// It fetches up to 20 activities first; if that's not enough, it fetches up to
// 80 more using the oldest activity's timestamp as a cursor. Stops after that.
func FetchRecentOutdoorActivities(athleteID int64, limit int) ([]types.ActivityMeta, error) {
	accessToken, err := GetValidAccessToken(athleteID)
	if err != nil {
		return nil, err
	}

	results := make([]types.ActivityMeta, 0, limit)

	// First pass: 20 activities.
	first, err := fetchActivitiesPage(accessToken, 20, 0)
	if err != nil {
		return nil, err
	}
	var oldest int64
	for _, a := range first {
		if a.SportType == "VirtualRide" || a.Trainer {
			continue
		}
		results = append(results, toMeta(a, athleteID))
		if len(results) >= limit {
			return results, nil
		}
	}
	if len(first) == 0 {
		return results, nil
	}

	// Derive the before= cursor from the UTC start_date of the last item in the page.
	last := first[len(first)-1]
	t, terr := time.Parse(time.RFC3339, last.StartDate)
	if terr != nil {
		// Can't paginate further without a valid timestamp.
		return results, nil
	}
	oldest = t.Unix()

	// Second pass: up to 80 more activities, starting just before the oldest above.
	second, err := fetchActivitiesPage(accessToken, 80, oldest)
	if err != nil {
		// Return what we have rather than failing entirely.
		return results, nil
	}
	for _, a := range second {
		if a.SportType == "VirtualRide" || a.Trainer {
			continue
		}
		results = append(results, toMeta(a, athleteID))
		if len(results) >= limit {
			return results, nil
		}
	}

	return results, nil
}

// FetchActivityMeta fetches activity metadata from the Strava API.
func FetchActivityMeta(athleteID, activityID int64) (*types.ActivityMeta, error) {
	accessToken, err := GetValidAccessToken(athleteID)
	if err != nil {
		return nil, err
	}

	apiURL := fmt.Sprintf("https://www.strava.com/api/v3/activities/%d", activityID)
	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 403 || resp.StatusCode == 404 {
		return nil, nil
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("strava meta: unexpected status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var result struct {
		ID             int64   `json:"id"`
		Name           string  `json:"name"`
		StartDateLocal string  `json:"start_date_local"`
		Distance       float64 `json:"distance"`
		SportType      string  `json:"sport_type"`
		Trainer        bool    `json:"trainer"`
		Athlete        struct {
			ID int64 `json:"id"`
		} `json:"athlete"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	return &types.ActivityMeta{
		ActivityID:     result.ID,
		AthleteID:      athleteID,
		Name:           result.Name,
		StartDate:      strings.TrimSuffix(result.StartDateLocal, "Z"),
		DistanceMeters: result.Distance,
		SportType:      result.SportType,
		Trainer:        result.Trainer,
	}, nil
}
