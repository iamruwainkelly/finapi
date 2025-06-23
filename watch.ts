// watch.ts
import { watch } from 'chokidar';

watch('./src', { ignored: /(^|[/\\])\.|node_modules|data\.db(-journal)?/ }).on(
  'all',
  (event, path) => {
    console.log(`[${event.toUpperCase()}] ${path}`);
  },
);
