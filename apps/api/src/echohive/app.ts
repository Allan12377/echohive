import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import routes from '@routes/index';
import { uploadDirectory } from '@config/uploads';

export function createApp(): Application {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: process.env.WEB_ORIGIN || 'http://localhost:3000' }));
  app.use(morgan('dev'));
  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  app.use('/uploads', express.static(uploadDirectory, {
    maxAge: '1d',
    setHeaders: (res) => res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox"),
  }));
  app.use('/api/v1', routes);

  return app;
}
