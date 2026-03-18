# Where'd I Go?

#### An app to list all towns a ride goes through

Go serverless backend, TypeScript/React frontend, Redis store

Hosted: https://whered-i-go.vercel.app

This will allow a user to upload a .gpx or .fit file or connect with Strava.
On connection with Strava, the app will grab outdoor rides from the athlete's recent 100 activities, and save up to 5 of the most recent. The are then available to select in webapp which will crunch the route and boundaries and calculate the areas passed through. Future rides posted to Strava will be posted here as well.

Running locally:

This will require env configs pulled from vercel, so it may not be possible except with access to the app there.

#### Redis Instance

```
docker run -d --name wdig-redis -p 6379:6379 redis:7-alpine
```

#### HTTP wrapper (talks to the Redis instance above)

```
docker run -d --name wdig-redis-http -p 8079:80 \
 -e SRH_MODE=env \
 -e SRH_TOKEN=localtoken \
 -e SRH_CONNECTION_STRING="redis://host.docker.internal:6379" \
 hiett/serverless-redis-http:latest
```

### starting vercel

```
npm run api
```

### starting the frontend in HMR mode

```
npm install
npm start
```
