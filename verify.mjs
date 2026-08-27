import { calculate } from './financeEngine.js';
import { clonePromotion } from './src/utils/promotionUtils.js';

const CASES = [
  { n: 1, mode: 'HP', inputs: { carPrice: 3799000, downPct: 20, accessory: 0, bsi: 0, term: 84, sfFlatRate: 3.58, addInterest: 0 },
    expect: { monthly: 45247.90, sfEffRate: 6.5798, rebate: 0 } },
  { n: 2, mode: 'HP-BL', inputs: { carPrice: 3799000, downPct: 15, balloonPct: 35, accessory: 0, bsi: 0, term: 60, sfEffRate: 7.689, addInterest: 2 },
    expect: { monthly: 50804.52, realSfRate: 8.439, sfInstallment: 48266.09, rebate: -123903.44, custFlatRate: 7.1150 } },
  { n: 3, mode: 'FC', inputs: { carPrice: 3799000, downPct: 15, gfv: 1839500, accessory: 0, bsi: 0, term: 48, sfEffRate: 7.5, addInterest: 0 },
    expect: { monthly: 45097.09, gfvPct: 48.4206, custFlatRate: 6.0001 } },
  { n: 4, mode: 'FL', inputs: { carPrice: 3849000, depositPct: 20, balloonPct: 0, accessory: 0, bsi: 0, term: 60, sfEffRate: 8.44, addInterest: 1.72 },
    expect: { monthly: 65666.58, realSfRate: 9.05, sfInstallment: 63993.87, rebate: -80485.64 } },
  { n: 5, mode: 'FL-BL', inputs: { carPrice: 3849000, depositPct: 25, balloonPct: 40, accessory: 0, bsi: 0, term: 60, sfEffRate: 6.86, addInterest: 0 },
    expect: { monthly: 35387.67, custFlatRate: 5.3771 } },
];

const PCT_KEYS = new Set(['sfEffRate', 'realSfRate', 'custFlatRate', 'gfvPct']);
let pass = 0, fail = 0;

for (const c of CASES) {
  const r = calculate(c.mode, c.inputs);
  console.log(`\n── Case ${c.n} · ${c.mode} ──`);
  for (const [k, want] of Object.entries(c.expect)) {
    const isPct = PCT_KEYS.has(k);
    const got = isPct ? r[k] * 100 : r[k];
    const dp = isPct ? 4 : 2;
    const ok = Math.abs(got - want) < (isPct ? 5e-5 : 5e-3);
    console.log(`  ${ok ? '✅' : '❌'} ${k.padEnd(15)} ได้ ${got.toFixed(dp).padStart(14)}  ต้องได้ ${want.toFixed(dp).padStart(14)}${ok ? '' : `   ต่าง ${(got - want).toFixed(dp)}`}`);
    ok ? pass++ : fail++;
  }
}

// ── BSI-merge invariant: ราคา 3,849,000+BSI 0 ต้องได้ค่างวดเท่ากับ ราคา 3,749,000+BSI 100,000 ──
const mergeBsi = (inp) => ({ ...inp, carPrice: (inp.carPrice||0) + (inp.bsi||0), bsi: 0 });
const BSI_CASES = [
  { mode: 'HP',    base: { downPct:25, accessory:0, term:60, sfFlatRate:1.99, addInterest:0 } },
  { mode: 'HP-BL', base: { downPct:25, balloonPct:30, accessory:0, term:60, sfEffRate:7.66, addInterest:0 } },
  { mode: 'FC',    base: { downPct:25, gfv:0, accessory:0, term:48, sfEffRate:7.50, addInterest:0 } },
  { mode: 'FL',    base: { depositPct:25, balloonPct:0, accessory:0, term:60, sfEffRate:8.44, addInterest:1.72 } },
  { mode: 'FL-BL', base: { depositPct:25, balloonPct:40, accessory:0, term:60, sfEffRate:6.86, addInterest:0 } },
];
console.log(`\n${'─'.repeat(50)}\nBSI-merge invariant: ราคา 3,849,000+BSI 0 === ราคา 3,749,000+BSI 100,000`);
for (const { mode, base } of BSI_CASES) {
  const inputA = { ...base, carPrice: 3849000, bsi: 0 };
  const inputB = { ...base, carPrice: 3749000, bsi: 100000 };
  const rA = calculate(mode, mergeBsi(inputA));
  const rB = calculate(mode, mergeBsi(inputB));
  const ok = Math.abs(rA.monthly - rB.monthly) < 0.005;
  console.log(`  ${ok ? '✅' : '❌'} ${mode.padEnd(6)} monthly A=${rA.monthly.toFixed(2).padStart(12)}  B=${rB.monthly.toFixed(2).padStart(12)}${ok ? '' : `  ต่าง ${(rA.monthly - rB.monthly).toFixed(2)}`}`);
  ok ? pass++ : fail++;
}

// ── clonePromotion: deep clone สำหรับฟีเจอร์ "คัดลอกจากโปรโมชั่นอื่น" ──
console.log(`\n${'─'.repeat(50)}\nclonePromotion`);
const srcPromo = {
  month: 'ต้นฉบับ',
  importedAt: 1000,
  terms: [48, 60],
  balloonTable: { กลุ่มA: { 60: { max: 40, min: 20 } } },
  HP: { default: [{ min: 20, max: 35, term: 60, rate: 3.5 }], special: [] },
};

{
  const clone = clonePromotion(srcPromo, 9999);
  clone.balloonTable['กลุ่มA'][60].max = 999;
  const ok = srcPromo.balloonTable['กลุ่มA'][60].max === 40;
  console.log(`  ${ok ? '✅' : '❌'} แก้ค่าลึกใน clone ไม่กระทบต้นฉบับ (ต้นฉบับ max=${srcPromo.balloonTable['กลุ่มA'][60].max})`);
  ok ? pass++ : fail++;
}
{
  const clone = clonePromotion(srcPromo, 9999);
  const ok = clone.importedAt === 9999 && srcPromo.importedAt === 1000;
  console.log(`  ${ok ? '✅' : '❌'} importedAt เป็นค่าใหม่ (clone=${clone.importedAt}, ต้นฉบับ=${srcPromo.importedAt})`);
  ok ? pass++ : fail++;
}
{
  const clone = clonePromotion(srcPromo, 9999);
  const srcKeys = Object.keys(srcPromo).sort();
  const cloneKeys = Object.keys(clone).sort();
  const ok = srcKeys.length === cloneKeys.length && srcKeys.every((k, i) => k === cloneKeys[i]);
  console.log(`  ${ok ? '✅' : '❌'} Object.keys ของ clone ครบเท่าต้นฉบับ (ต้นฉบับ ${srcKeys.length} key, clone ${cloneKeys.length} key)`);
  ok ? pass++ : fail++;
}

console.log(`\n${'='.repeat(50)}\nสรุป: ผ่าน ${pass} / ${pass + fail} จุด${fail ? ` ❌ ตก ${fail} จุด` : ' ✅ ครบ'}\n`);
process.exit(fail ? 1 : 0);
