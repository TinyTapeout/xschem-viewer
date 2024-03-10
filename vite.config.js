import child from 'child_process';
import { defineConfig } from 'vite';

const commitHash = child.execSync('git rev-parse --short HEAD').toString();

export default defineConfig(() => {
  return {
    define: {
      __COMMIT_HASH__: JSON.stringify(commitHash.trim()),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
  };
});
