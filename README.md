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

 ### Releases

```bash
$ sh release.sh <ver>
```