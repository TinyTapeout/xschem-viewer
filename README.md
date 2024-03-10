# xschem-viewer

[![Build and Lint](https://github.com/TinyTapeout/xschem-viewer/actions/workflows/ci.yml/badge.svg)](https://github.com/TinyTapeout/xschem-viewer/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

Explore and visualize [XSchem](https://xschem.sourceforge.io/stefan/index.html) schematics in your browser.

## Local Development

### Prerequisites

- [Node.js](https://nodejs.org/en/) (v20 or later) and NPM (usually comes with Node.js)

### Instructions

1. Clone the repository
2. Run `npm install` to install dependencies
3. Run `npm run dev` to start the development server
4. Open [http://localhost:5173](http://localhost:5173) in your browser

Enjoy!

### Running the tests

`npm test` will run the tests once. `npm run test:watch` will run the tests in watch mode.

### Rebuilding the .sch parser

When making changes to the [sch file parser](src/xschem-parser.peg), you will need to rebuild the parser by running `npm run build:parser`. This will generate a new `xschem-parser.ts` file in the `src` directory.

## License

xschem-viewer is licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for more details.
