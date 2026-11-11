import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './fixtures/c3-java-contract.json' with { type: 'json' };

test('Java-derived C3 contract fixture covers routes 21-30 and DTO shapes', () => {
  assert.deepEqual(fixture.routes.map((route) => route.number), [21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);
  assert.equal(fixture.routes.filter((route) => route.status === 201).length, 3);
  assert.equal(fixture.routes.filter((route) => route.status === 200).length, 7);
  assert.equal(fixture.rentalDtoFields.length, 19);
  assert.equal(fixture.chargeDtoFields.length, 13);
  assert.deepEqual(fixture.pageFields, [
    'content', 'pageNumber', 'pageSize', 'totalElements', 'totalPages', 'last',
  ]);
});
