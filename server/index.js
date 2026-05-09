import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import * as turf from '@turf/turf';
import Ship from './models/Ship.js';
import NavigableWater from './models/NavigableWater.js';
import { resolveCorsOrigins } from './config/cors.config.js';
import { createHealthRouter } from './routes/health.routes.js';
import { createNavigableWaterRouter } from './routes/navigable-water.routes.js';
import { createShipsRouter } from './routes/ships.routes.js';
import { Simulator } from './services/Simulator.js';

const PORT = Number(process.env.PORT) || 5050;
const MONGO_URI = process.env.MONGO_URI;
const allowedOrigins = resolveCorsOrigins();

const app = express();
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

io.on('connection', (socket) => {
  socket.emit('connected', { message: 'fleet channel ready' });
});

async function main() {
  if (!MONGO_URI) {
    console.error('Missing MONGO_URI in environment.');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log('MongoDB connected');

  const nwDoc = await NavigableWater.findOne().lean();
  if (!nwDoc?.polygon?.coordinates) {
    console.error('NavigableWater not seeded. Run: npm run seed');
    process.exit(1);
  }

  const navigable = turf.polygon(nwDoc.polygon.coordinates);

  const shipDocs = await Ship.find({}).sort({ shipId: 1 }).exec();
  if (shipDocs.length !== 15) {
    console.warn(
      `[Boot] Expected 15 ships in DB, found ${shipDocs.length}. Run: npm run seed`
    );
  }

  const ramShips = Simulator.fromDocuments(shipDocs);
  const simulator = new Simulator({ io, navigable, ships: ramShips });

  app.use(createHealthRouter());
  app.use('/api/ships', createShipsRouter(simulator));
  app.use('/api/navigable-water', createNavigableWaterRouter(nwDoc));

  simulator.start();

  server.listen(PORT, () => {
    console.log(`HTTP + Socket.io listening on port ${PORT}`);
    console.log(`CORS: ${allowedOrigins.join(', ')}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
