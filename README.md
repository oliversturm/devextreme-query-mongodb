
## Querying a MongoDB collection using DevExtreme data store load parameters

The JavaScript library [DevExtreme](https://js.devexpress.com/) by [DevExpress](https://www.devexpress.com) includes a highly advanced [data layer](https://js.devexpress.com/Documentation/Guide/Data_Layer/Data_Layer/). Many of the complex data-bound UI widgets in the library utilize the data layer infrastructure to load server-provided data efficiently.

When data is loaded by a data source attached to a UI widget (or by code interaction with the data source), the underlying data store receives a call to its `load` function, and a parameter object is passed that I will refer to as `loadOptions`. If you implement a custom store to load data from your own server through a service interface, the server will (or should!) receive the `loadOptions` and query data accordingly.

The library **devextreme-query-mongodb** implements the required logic to query data from a MongoDB collection, parametrized by a DevExtreme `loadOptions` object.

### Requirements

#### For v2.x

In v2, the library is published with babel-compiled files (in the dist) folder, which are used by default. This provides broader compatibility, but it introduces a requirement for `babel-polyfill`. To satisfy this, you should add a dependency to `babel-polyfill` to your project (`npm install --save babel-polyfill`) and initialize the polyfill before you load **devextreme-query-mongodb**:

```js
require('babel-polyfill');
const query = require('devextreme-query-mongodb');
```

#### For v1.x

**devextreme-query-mongodb** requires at least version 7.3 of Node.js, and you need to pass the `--harmony` flag when running `node` (unless you're using the latest 8.x nightly builds, where `--harmony` is not required anymore). The reason for this requirement is that **devextreme-query-mongodb** uses `async` and `await`.

### Installing **devextreme-query-mongodb**

The library is available through npm:

`npm install devextreme-query-mongodb`

### Documentation

Please see [the Wiki](https://github.com/oliversturm/devextreme-query-mongodb/wiki).

### Status

The implementation is believed to be feature-complete at this time, but it comes without warranty. Please report any issues if you find them!
