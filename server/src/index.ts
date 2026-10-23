import 'dotenv/config';
import { createApp } from './app.js';
import { OpenMeteoProvider } from './providers/openMeteo.js';
import { WeatherService } from './services/weatherService.js';

const port = Number(process.env.PORT ?? 3001);
const ttlSeconds = Number(process.env.FORECAST_CACHE_TTL ?? 600);
const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const service = new WeatherService(new OpenMeteoProvider(), ttlSeconds * 1000);
const app = createApp(service, corsOrigins);

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
