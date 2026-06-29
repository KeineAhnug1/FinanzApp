import { netSettlements } from '../group-shared';

function expectEq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`FAIL ${msg}: ${a} !== ${e}`);
  console.log(`OK   ${msg}`);
}

expectEq(netSettlements(new Map()), [], 'empty');
expectEq(netSettlements(new Map([[1, 10], [2, -10]])), [{ from: 2, to: 1, amount: 10 }], 'simple 1-to-1');
const r3 = netSettlements(new Map([[1, 20], [2, 0], [3, -20]]));
expectEq(r3.length, 1, 'three-way reduces to one');
expectEq(r3[0], { from: 3, to: 1, amount: 20 }, 'three-way result');
const r4 = netSettlements(new Map([[1, 10.005], [2, -10.005]]));
expectEq(r4[0]?.amount, 10, 'rounding');
console.log('all tests passed');
