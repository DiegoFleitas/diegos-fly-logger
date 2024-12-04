### Requirements

- express

### Configuration

`PRETTIFY_LOGS` env var

### Installation

On an express app

```js
import { logging } from 'diegos-fly-logger/index.mjs';

app.use(logging);
```

 ### Releases

```bash
$ sh release.sh <ver>
```