import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

// Inject current git commit hash so it's visible in the UI
const gitHash = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); }
  catch { return 'unknown'; }
})();

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/-jigsaw-puzzles-io/',
  define: {
    __GIT_HASH__: JSON.stringify(gitHash),
  },
})
