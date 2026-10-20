/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      1,
      'always',
      ['sdk', 'protocol', 'ingest', 'worker', 'api', 'web', 'db', 'infra', 'ci', 'deps', 'docs'],
    ],
  },
};
