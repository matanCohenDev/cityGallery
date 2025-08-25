const fetch = require('node-fetch');
const Branch = require('../models/galleryBranches_model');
const OWM_KEY = process.env.OWM_API_KEY;

const cache = new Map(); 
const TTL_MS = 10 * 60 * 1000; 

function visitAdvice({ tempC, weatherMain, wind }) {
  const windy = wind && wind > 9; 
  const rainy = /rain|drizzle|thunderstorm/i.test(weatherMain || '');

  if (rainy) return { label: 'גשום — עדיף לבדוק שעות פתיחה ולהביא מטריה ☔', tone: 'warn' };
  if (tempC >= 15 && tempC <= 27 && !windy) return { label: 'מצוין לביקור 🌤️', tone: 'ok' };
  if (tempC >= 8 && tempC < 15) return { label: 'קריר — מעולה לגלריה פנימית 🧥', tone: 'soft' };
  if (tempC > 27 && !rainy) return { label: 'חם — ביקור פנימי ממוזג מומלץ 🥵', tone: 'soft' };
  if (tempC < 8) return { label: 'קר — גלריה פנימית עדיפה ❄️', tone: 'soft' };
  if (windy) return { label: 'רוח חזקה — עדיף בפנים 💨', tone: 'soft' };
  return { label: 'סבבה לביקור', tone: 'ok' };
}

exports.getBranchesWeather = async (req, res, next) => {
  try {
    if (!OWM_KEY) return res.status(500).json({ msg: 'Missing OWM_API_KEY' });

    const branches = await Branch.find({}, { name: 1, city: 1, country: 1, 'location.lat': 1, 'location.lng': 1 }).lean();

    const jobs = branches
      .filter(b => b?.location?.lat != null && b?.location?.lng != null)
      .map(b => ({
        _id: String(b._id),
        name: b.name || 'Gallery',
        city: b.city || '',
        country: b.country || '',
        lat: b.location.lat,
        lon: b.location.lng
      }));

    const now = Date.now();
    const fetchOne = async (job) => {
      const key = `${job.lat.toFixed(2)},${job.lon.toFixed(2)}`;
      const hit = cache.get(key);
      if (hit && now - hit.ts < TTL_MS) return { job, wx: hit.data };

      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${job.lat}&lon=${job.lon}&appid=${OWM_KEY}&units=metric`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`OWM ${r.status}`);
      const data = await r.json();
      cache.set(key, { data, ts: now });
      return { job, wx: data };
    };

    const results = await Promise.allSettled(jobs.map(fetchOne));

    const out = results.map((r, i) => {
      const job = jobs[i];
      if (r.status !== 'fulfilled') {
        return {
          branchId: job._id, name: job.name, city: job.city, country: job.country,
          error: r.reason?.message || 'fetch failed'
        };
      }
      const wx = r.value.wx || {};
      const tempC = Math.round(wx.main?.temp ?? NaN);
      const feels = Math.round(wx.main?.feels_like ?? NaN);
      const weatherMain = wx.weather?.[0]?.main || '';
      const weatherDesc = wx.weather?.[0]?.description || '';
      const wind = wx.wind?.speed ?? null;
      const advice = visitAdvice({ tempC, weatherMain, wind });

      return {
        branchId: job._id,
        name: job.name,
        city: job.city,
        country: job.country,
        lat: job.lat,
        lon: job.lon,
        tempC,
        feelsLikeC: feels,
        weatherMain,
        weatherDesc,
        windMs: wind,
        humidity: wx.main?.humidity ?? null,
        advice
      };
    });

    res.json({ items: out, updatedAt: new Date().toISOString(), ttlSeconds: Math.floor(TTL_MS / 1000) });
  } catch (err) { next(err); }
};
