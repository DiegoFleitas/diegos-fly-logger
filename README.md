### Requirements

- express

### Configuration

`PRETTIFY_LOGS` env var

### Installation

On an express app

create an .npmrc file with

//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN

```js
import { logging } from 'diegos-fly-logger/index.mjs';

app.use(logging);
```

### Publishing a Release

1. Run the release script with the desired version:
   ```sh
   sh release.sh <version>
   ```

2. Publish the package to npm:
   ```sh
   npm publish
   ```