// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Tiny Tapeout LTD
// Author: Uri Shaked

import child from 'child_process';
import { fileURLToPath, URL } from 'url';
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

const commitHash = child.execSync('git rev-parse --short HEAD').toString();

export default defineConfig(() => {
  return {
    plugins: [solidPlugin()],

    define: {
      __COMMIT_HASH__: JSON.stringify(commitHash.trim()),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },

    resolve: {
      alias: [{ find: '~', replacement: fileURLToPath(new URL('./src', import.meta.url)) }],
    },
  };
});
