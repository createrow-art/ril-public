import { startApi } from './api.js';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
startApi(port);
