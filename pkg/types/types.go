package types

type User struct {
	StravaAthleteID int64  `json:"stravaAthleteId"`
	AthleteName     string `json:"athleteName"`
	AvatarURL       string `json:"avatarUrl,omitempty"`
}

type StoredTokens struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	ExpiresAt    int64  `json:"expiresAt"` // Unix seconds
}

type ActivityMeta struct {
	ActivityID     int64   `json:"activityId"`
	AthleteID      int64   `json:"athleteId"`
	Name           string  `json:"name"`
	StartDate      string  `json:"startDate"`      // ISO 8601
	DistanceMeters float64 `json:"distanceMeters"`
	// Filtering fields — populated from Strava API, never stored or sent to client.
	SportType string `json:"-"`
	Trainer   bool   `json:"-"`
}
