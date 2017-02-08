module.exports = {
	"parserOptions": {
		ecmaVersion: 2017
	},
    "env": {
        "es6": true,
        "node": true
    },
    "extends": "eslint:recommended",
    "rules": {
        "indent": "off",
	"no-mixed-spaces-and-tabs": "off",
        "linebreak-style": [
            "error",
            "unix"
        ],
        "quotes": [
            "error",
            "double"
        ],
        "semi": [
            "error",
            "always"
        ]
    }
};
