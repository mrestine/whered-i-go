# Where'd I Go?

#### A Simple React App to list all towns a ride goes through given a .gpx or .fit file.

Running locally:

```
npm install
npm start
```

This will:

- Calculate the bounding box of the route
- Get the relevant geographic boundaries from Overpass
- Calculate border crossings
- Show a list of the most specific areas traveled through
