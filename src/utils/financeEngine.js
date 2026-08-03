// ============ FINANCIAL FUNCTIONS ============
// แหล่งเดียว (single source of truth) สำหรับสูตรคำนวณค่างวดทั้ง 5 โหมด
// ใช้ร่วมกันโดย App.jsx (หน้าใบเสนอราคาเดิม) และ QuickQuote.jsx (หน้า /quick)
//
// อ้างอิง: Quick_Quote_Project_Spec.md v1.2 ภาคผนวก A
// Verify แล้ว 5/5 เทียบกับ Test Case A.5 (จากไฟล์ Quotation_HP-FL-Balloon__BMW___1_.xlsx)
// ⚠️ ห้ามแก้สูตรในไฟล์นี้โดยไม่เทียบกับ Test Case A.5 ก่อนทุกครั้ง — โค้ดนี้ย้ายมาจาก
//    App.jsx เดิมแบบคำต่อคำ (ไม่มีการตีความใหม่) เพื่อไม่ให้ผลลัพธ์ของหน้าเดิมเปลี่ยน

export const PMT = (rate, nper, pv, fv = 0) => {
  if (rate === 0) return -(pv + fv) / nper;
  return -(pv * Math.pow(1 + rate, nper) + fv) * rate / (Math.pow(1 + rate, nper) - 1);
};

export const PV = (rate, nper, pmt, fv = 0) => {
  if (rate === 0) return -(pmt * nper + fv);
  return -(pmt * (Math.pow(1 + rate, nper) - 1) / rate + fv) / Math.pow(1 + rate, nper);
};

export const RATE = (nper, pmt, pv, fv = 0, guess = 0.1) => {
  let rate = guess;
  for (let i = 0; i < 100; i++) {
    const f = pv * Math.pow(1+rate,nper) + pmt * (Math.pow(1+rate,nper)-1)/rate + fv;
    const df = pv*nper*Math.pow(1+rate,nper-1) + pmt*(nper*Math.pow(1+rate,nper-1)*rate - (Math.pow(1+rate,nper)-1))/(rate*rate);

    // ป้องกันการหารด้วยศูนย์
    if (Math.abs(df) < 1e-10) break;

    const nr = rate - f/df;
    if (Math.abs(nr - rate) < 1e-10) return nr;
    rate = nr;
  }
  return rate;
};

export const MODES = {
  HP:     { label:"HP",    fullName:"Hire Purchase",   thaiName:"เช่าซื้อ",          rateLabel:"Flat Rate", hasBalloon:false, hasGFV:false, hasDeposit:false, hasRV:false },
  "HP-BL":{ label:"HP-BL", fullName:"HP Balloon",      thaiName:"เช่าซื้อ+Balloon",  rateLabel:"Eff. Rate", hasBalloon:true,  hasGFV:false, hasDeposit:false, hasRV:false },
  FC:     { label:"FC",    fullName:"Freedom Choice",  thaiName:"ฟรีดอม ชอยส์",     rateLabel:"Eff. Rate", hasBalloon:false, hasGFV:true,  hasDeposit:false, hasRV:false },
  FL:     { label:"FL",    fullName:"Financial Lease", thaiName:"ลีสซิ่ง",           rateLabel:"Eff. Rate", hasBalloon:true,  hasGFV:false, hasDeposit:true,  hasRV:true  },
  "FL-BL":{ label:"FL-BL", fullName:"FL Balloon",      thaiName:"ลีสซิ่ง+Balloon",  rateLabel:"Eff. Rate", hasBalloon:true,  hasGFV:false, hasDeposit:true,  hasRV:true  },
};

export const DEFAULT_INPUTS = {
  HP:     { carPrice:0, downPct:25, accessory:0, bsi:0, term:60, sfFlatRate:1.99, addInterest:0 },
  "HP-BL":{ carPrice:0, downPct:25, balloonPct:30, accessory:0, bsi:0, term:60, sfEffRate:7.66, addInterest:0 },
  FC:     { carPrice:0, downPct:25, gfv:0, accessory:0, bsi:0, term:48, sfEffRate:7.50, addInterest:0 },
  FL:     { carPrice:0, depositPct:25, balloonPct:0, accessory:0, bsi:0, term:60, sfEffRate:8.44, addInterest:1.72 },
  "FL-BL":{ carPrice:0, depositPct:25, balloonPct:40, accessory:0, bsi:0, term:60, sfEffRate:6.86, addInterest:0 },
};

export const calculate = (mode, inputs, discount = 0) => {
  const m = MODES[mode];
  const carPrice=(Number(inputs.carPrice)||0) - (Number(discount)||0); // หักส่วนลด
  const accessory=Number(inputs.accessory)||0, bsi=Number(inputs.bsi)||0;
  const term=Number(inputs.term)||1, addInt=(Number(inputs.addInterest)||0)/100;
  let downPct=0,downAmt=0,depositPct=0,depositAmt=0,balloonPct=0,balloonAmt=0,rvPct=0,rvAmt=0;
  let gfv=0,gfvPct=0,finance=0,monthly=0,custRate=0,sfRate=0,realSfRate=0,sfInstallment=0;
  let custFlatRate=0,rebate=0,rebate85=0,sfEffRate=0;

  if(m.hasDeposit){depositPct=(Number(inputs.depositPct)||0)/100; depositAmt=carPrice*depositPct;}
  else{downPct=(Number(inputs.downPct)||0)/100; downAmt=carPrice*downPct;}
  if(m.hasBalloon){balloonPct=(Number(inputs.balloonPct)||0)/100; balloonAmt=carPrice*balloonPct;}
  if(m.hasGFV){gfv=Number(inputs.gfv)||0; gfvPct=carPrice>0?gfv/carPrice:0;}
  if(m.hasRV){rvPct=depositPct+balloonPct; rvAmt=depositAmt+balloonAmt;}

  finance = carPrice-(m.hasDeposit?depositAmt:downAmt)+accessory+bsi;

  if(mode==="HP"){
    const sfFlat=(Number(inputs.sfFlatRate)||0)/100;
    custFlatRate=sfFlat+addInt; monthly=(finance*(1+custFlatRate*term/12))/term;
    realSfRate=addInt<=0.005?sfFlat:sfFlat+(addInt-0.005)/2;
    sfInstallment=(finance*(1+realSfRate*term/12))/term;
    const r=RATE(term,sfInstallment,-finance);
    sfEffRate=r?r*12:0; rebate=sfEffRate?PV(sfEffRate/12,term,monthly-sfInstallment):0; rebate85=rebate*0.85;
    custRate=custFlatRate; sfRate=sfFlat;
  }else if(mode==="HP-BL"){
    sfRate=(Number(inputs.sfEffRate)||0)/100; custRate=sfRate+addInt;
    realSfRate=addInt<=0.005?sfRate:sfRate+(addInt-0.005)/2;
    monthly=PMT(custRate/12,term,-finance,balloonAmt); sfInstallment=PMT(realSfRate/12,term,-finance,balloonAmt);
    custFlatRate=((((monthly*term)+balloonAmt)/finance)-1)/(term/12);
    rebate=PV(realSfRate/12,term,monthly-sfInstallment); rebate85=rebate*0.85; sfEffRate=realSfRate;
  }else if(mode==="FC"){
    sfRate=(Number(inputs.sfEffRate)||0)/100; custRate=sfRate+addInt;
    realSfRate=addInt<=0.005?sfRate:sfRate+(addInt-0.005)/2;
    monthly=PMT(custRate/12,term,-finance,gfv); sfInstallment=PMT(realSfRate/12,term,-finance,gfv);
    custFlatRate=((((monthly*term)+gfv)/finance)-1)/(term/12);
    rebate=PV(realSfRate/12,term,monthly-sfInstallment); rebate85=rebate*0.85; sfEffRate=realSfRate;
  }else if(mode==="FL"||mode==="FL-BL"){
    sfRate=(Number(inputs.sfEffRate)||0)/100; custRate=sfRate+addInt;
    realSfRate=addInt<=0.005?sfRate:sfRate+(addInt-0.005)/2;
    monthly=PMT(custRate/12,term,-finance,rvAmt-depositAmt); sfInstallment=PMT(realSfRate/12,term,-finance,balloonAmt);
    custFlatRate=((((monthly*term)+balloonAmt)/finance)-1)/(term/12);
    rebate=PV(realSfRate/12,term,monthly-sfInstallment); rebate85=rebate*0.85; sfEffRate=realSfRate;
  }

  const taxSaving48=m.hasRV?36000*48*0.2:0, taxSaving60=m.hasRV?36000*60*0.2:0;
  // rebateAmount = rebate (เต็ม 100%) สำหรับงบของแถม
  return{carPrice,accessory,bsi,term,addInt,downPct,downAmt,depositPct,depositAmt,balloonPct,balloonAmt,
    rvPct,rvAmt,gfv,gfvPct,finance,monthly,custRate,sfRate,realSfRate,sfEffRate,sfInstallment,
    custFlatRate,rebate,rebate85,taxSaving48,taxSaving60,rebateAmount:rebate};
};
