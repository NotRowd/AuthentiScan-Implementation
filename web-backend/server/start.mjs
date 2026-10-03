import {createApp} from './app.mjs';
const server = createApp().listen(5002, '127.0.0.1', () => console.log('Local Firebase API: http://127.0.0.1:5002'));
for (const event of ['SIGINT','SIGTERM']) process.on(event, () => server.close(() => process.exit(0)));
