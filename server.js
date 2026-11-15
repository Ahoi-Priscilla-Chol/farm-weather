require('dotenv').config();
const express = require('express');
const os = require('os');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.OPENWEATHER_API_KEY;
const CACHE_MINUTES = 10;
const cache = new Map ();

if (!API_KEY) {
    console.error('Missing OPENWEATHER_API_KEY. Add it to your  .env file.');
    process.exit(1);
}
// Shows which server answerd ( useful for testing the load balancer)
app.use((req, res, next) => {
    res.set('X-Served-By', os.hostname());
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.get('/api/server', (req, res) => {
    res.json({ server: os.hostname() });
});

app.get('/api/forecast', async (req, res) => {
    const city = String(req.query.city || '').trim();

    // Input validation
      if (city.length < 2 || city.length > 60 || !/^[\p{L}\s.,'-]+$/u.test(city)) {
        return res.status(400).json({
        error: 'Please enter a valid town name , like Juba or Kigali,RW.',
  });
}

// Reuse a save result if it is less than 10 mintues old 
const cacheKey = city.toLowerCase();
const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_MINUTES * 60 * 1000) {
    return res.json({ ...cached.data, cached: true });
}

const url =
   'https://api.openweathermap.org/data/2.5/forecast?' +
   new URLSearchParams({ q: city, units: 'metric', appid: API_KEY });

   try {
    const response = await fetch(url, {signal: AbortSignal.timeout(8000) });

    if (response.status == 404) {
        return res.status(404).json({ error: 'Town not found. Check the spelling and try again.' });
    }
    if (response.status === 429) {
        return res.status(429).json({error: 'Too many searches right now . Please wait a mintue and try again.'});  
    }
    if (!response.ok) {
        console .error('OPenWeather returned Status', response.status);
        return res.status(502).json({ error: 'The weather service has a problem. Please try again.'});    
    }

    const raw = await response.json();
    if (!raw.list || !raw.city) {
        return res.status(502).json({error: 'The weathe service sent an unexpected reply.' });
    }

    const data = {
        city: raw.city.name,
        country: raw.city.country,
        timezone: raw.city.timezone,
        list: raw.list.map((e) => ({
           dt: e.dt,
           temp: e.main.temp,
           humidity: e.main.humidity,
           description: e.weather[0].description,
           icon: e.weather[0].icon,
           pop: e.pop || 0,
           rain: (e.rain && e.rain['3h']) || 0,
           wind: e.wind.speed,
        })),
   };

   cache .set(cacheKey, { time: Date.now(), data });
   res.json({...data, cached: false });
  } catch (err) {
    console.error('Request failed:', err.name);
    res.status(504).json({ error: 'The weather service did not respond. Please try again.' });
  }    
});

app.listen(PORT, () => {
    console.log('Farm Weather server is running on port' + PORT);
}); 


