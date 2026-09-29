import 'dotenv/config';
import http from 'http';
import { createApp } from './app';
import { initSockets } from '@sockets/index';

const PORT = Number(process.env.PORT ?? 4000);

const app = createApp();
const httpServer = http.createServer(app);

initSockets(httpServer);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});
