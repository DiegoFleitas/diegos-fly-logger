### Requirements

- express

### Configuration

`PRETTIFY_LOGS` env var


### Installation

On an express app, install the package from npm:

```sh
npm install diegos-fly-logger
```

Then, use it in your application:

```js
import { logging } from 'diegos-fly-logger';

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