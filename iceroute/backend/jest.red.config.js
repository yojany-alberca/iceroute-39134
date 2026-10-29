// Fase ROJA de TDD: los mismos tests, pero los servicios se reemplazan por esqueletos sin lógica.
const base = require('./package.json').jest;
module.exports = {
  ...base,
  moduleNameMapper: { '^\\.\\./src/services/(.*)$': '<rootDir>/tdd-red/services/$1' },
};
