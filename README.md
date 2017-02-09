
## Querying a MongoDB collection using DevExtreme data store load parameters

The JavaScript library [DevExtreme](https://js.devexpress.com/) by [DevExpress](https://www.devexpress.com) includes a highly advanced [data layer](https://js.devexpress.com/Documentation/16_1/Guide/Data_Layer/Data_Layer/). Many of the complex data-bound UI widgets in the library utilize the data layer infrastructure to load server-provided data efficiently.

When data is loaded by a data source attached to a UI widget (or by code interaction with the data source), the underlying data store receives a call to its `load` function, and a parameter object is passed that I will refer to as `loadOptions`. If you implement a custom store to load data from your own server through a service interface, the server will (or should!) receive the `loadOptions` and query data accordingly.

The library **devextreme-query-mongodb** implements the required logic to query data from a MongoDB collection, parametrized by a DevExtreme `loadOptions` object.

### What are `loadOptions`?

The supported options are outlined in the [CustomStore reference](https://js.devexpress.com/Documentation/16_1/ApiReference/Data_Layer/CustomStore/Configuration/#load). Since the dxDataGrid widget is one that utilizes complex combinations of `loadOptions` depending on its setup, there is further documentation available in [the *Use Custom Store* block of its documentation](https://js.devexpress.com/Documentation/16_1/Guide/UI_Widgets/Data_Grid/Use_Custom_Store/).

### Requirements

**devextreme-query-mongodb** requires at least version 7.3 of Node.js, and you need to pass the `--harmony` flag when running `node` (unless you're using the latest 8.x nightly builds, where `--harmony` is not required anymore). The reason for this requirement is that **devextreme-query-mongodb** uses `async` and `await`.

### Installing **devextreme-query-mongodb**

The library is available through npm:

`npm install devextreme-query-mongodb`

### Running queries

The API is very simple, it only supplies one call. The following block of code runs a query, assuming the MongoDB connection parameters are correct for your setup, and the collection `values` exists with items that have a `intval` field:

```js
const MongoClient = require("mongodb").MongoClient;
const query = require("devextreme-query-mongodb");

async function queryData() {
	MongoClient.connect("mongodb://localhost:27017/testdatabase", (err, db) => {
		const results = await query(db.collection("values"), {
			// This is the loadOptions object - pass in any valid parameters
			take: 10,
			filter: [ "intval", ">", 47 ],
			sort: [ { selector: "intval", desc: true }]
		});
		
		// Now "results" contains an array of ten or fewer documents from the 
		// "values" collection that have intval > 47, sorted descendingly by intval.
	});
}
```

### More examples

Apart from the documentation linked above, I recommend you check out the tests in this repository to see additional examples for `loadOptions`.

### Status

The implementation is believed to be feature-complete at this time, but I'd be very surprised if it was bug-free. Please report any issues if you find them!
