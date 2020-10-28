module.exports = () => ({
  files: [
    'src/*.js',
    { pattern: 'src/options.test.js', ignore: true },
    { pattern: 'src/pipelines.test.js', ignore: true },
    { pattern: 'src/utils.test.js', ignore: true },
  ],
  // excluding index.test.js - these tests require running mongodb
  tests: ['src/options.test.js', 'src/pipelines.test.js', 'src/utils.test.js'],

  testFramework: 'mocha',

  env: { type: 'node' },

  setup: (w) => {
    const mocha = w.testFramework;
    mocha.ui('tdd');
  },
});
