import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import diagramReconstruction from './server/diagramReconstruction.js';

const reconstructionApi = () => {
  const register = (server: any) => {
    server.middlewares.use((request: any, response: any, next: () => void) => {
      if (request.url?.split('?')[0] !== '/api/diagram-reconstruction') return next();
      void diagramReconstruction(request, response);
    });
  };
  return { name: 'diagram-reconstruction-api', configureServer: register, configurePreviewServer: register };
};

export default defineConfig(({ mode }) => {
    const environment = loadEnv(mode, '.', 'DIAGRAM_API_BASE_URL');
    if (process.env.DIAGRAM_API_BASE_URL === undefined && environment.DIAGRAM_API_BASE_URL) {
      process.env.DIAGRAM_API_BASE_URL = environment.DIAGRAM_API_BASE_URL;
    }
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), reconstructionApi()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
