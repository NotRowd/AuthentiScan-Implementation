const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');

test('GET /api/v1/health returns the API status', async () => {
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'online');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
