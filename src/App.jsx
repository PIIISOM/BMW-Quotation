import { useState, useEffect, useRef, useMemo } from "react";
import { Save, FolderOpen, Trash2, Settings, ChevronRight, Info, X, Check, ChevronDown, Search, Plus, Edit2, MessageSquare, RotateCcw, Download, Upload } from "lucide-react";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, onSnapshot, setDoc } from "firebase/firestore";

// ============ FIREBASE SETUP ============
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const SHARED_DOC = doc(db, "shared", "data");

// Helper: บันทึกขึ้น Firebase
const saveToCloud = async (key, value) => {
  try {
    await setDoc(SHARED_DOC, { [key]: value }, { merge: true });
  } catch (e) {
    console.warn("Cloud sync failed, using local only:", e);
  }
};

const APP_VERSION = "2.5.1";

// ============ DEFAULT FREEBIES ============
const DEFAULT_FREEBIES = [
  {
    id: "fb-001",
    name: "BSI Ultimate (5 ปี)",
    detail: "5 ปี / 100,000 กม.",
    cost: 45000
  },
  {
    id: "fb-002",
    name: "ประกันภัยชั้น 1",
    detail: "+ พ.ร.บ. 1 ปี",
    cost: 25000
  },
  {
    id: "fb-003",
    name: "ฟิล์มเซรามิค",
    detail: "รอบคัน",
    cost: 18000
  },
  {
    id: "fb-004",
    name: "ชุดแต่ง M Sport",
    detail: "Body Kit ครบชุด",
    cost: 120000
  },
  {
    id: "fb-005",
    name: "พรมปูพื้น + ผ้ายาง",
    detail: "ชุดครบ 4 ชิ้น",
    cost: 8500
  }
];

// ============ PROMOTION DATA STRUCTURE ============
const DEFAULT_PROMOTION = {
  month: "",
  importedAt: null,
  terms: [48, 60],
  HP: {
    default: [
      { min: 0, max: 19, rate: 2.49 },
      { min: 20, max: 35, rate: 1.99 },
      { min: 36, max: 100, rate: 1.59 }
    ],
    special: []
  },
  "HP-BL": {
    default: [
      { min: 0, max: 19, rate: 8.20 },
      { min: 20, max: 35, rate: 7.66 },
      { min: 36, max: 100, rate: 7.20 }
    ],
    special: []
  },
  FC: {
    default: [
      { min: 0, max: 19, rate: 8.20 },
      { min: 20, max: 35, rate: 7.66 },
      { min: 36, max: 100, rate: 7.20 }
    ],
    special: []
  },
  FL: {
    default: [
      { min: 0, max: 19, rate: 9.00 },
      { min: 20, max: 35, rate: 8.44 },
      { min: 36, max: 100, rate: 8.00 }
    ],
    special: []
  },
  "FL-BL": {
    default: [
      { min: 0, max: 19, rate: 7.50 },
      { min: 20, max: 35, rate: 6.86 },
      { min: 36, max: 100, rate: 6.50 }
    ],
    special: []
  }
};

// ฟังก์ชันหาอัตราดอกเบี้ย
// แปลง format โปรโมชั่นเก่า (ไม่มี term ใน tier) → format ใหม่
const migratePromotion = (promo) => {
  if (!promo) return promo;
  const DEFAULT_TERMS = (promo.terms || [48, 60]).map(Number);
  const modes = ["HP","HP-BL","FC","FL","FL-BL"];
  const migrated = { ...promo };
  modes.forEach(m => {
    if (!promo[m]?.default) return;
    const hasTermField = promo[m].default.some(t => t.term !== undefined);
    if (hasTermField) return;
    const newDefault = [];
    promo[m].default.forEach(tier => {
      DEFAULT_TERMS.forEach(term => {
        newDefault.push({ ...tier, term: Number(term) });
      });
    });
    migrated[m] = { ...promo[m], default: newDefault };
  });
  return migrated;
};

const getRateForPromotion = (mode, carModel, downPct, term, promotionData) => {
  if (!promotionData || !promotionData[mode]) return null;
  const migratedPromo = migratePromotion(promotionData);
  const modeData = migratedPromo[mode];
  const termNum = Number(term) || 60;

  // 1. Special Rates (fuzzy match ชื่อรถ)
  if (modeData.special && modeData.special.length > 0) {
    const special = modeData.special.find(s => {
      const modelLower = carModel.toLowerCase().trim();
      const specModelLower = s.model.toLowerCase().trim();
      return modelLower.includes(specModelLower) || specModelLower.includes(modelLower);
    });
    if (special && downPct >= special.downMin && downPct <= special.downMax) {
      return {
        rate: special.rate,
        type: 'special',
        source: `${special.model} + Down ${special.downMin}-${special.downMax}%`
      };
    }
  }

  // 2. Default Tier — match ทั้ง down% และ term
  if (modeData.default && modeData.default.length > 0) {
    const tier = modeData.default.find(t =>
      downPct >= t.min && downPct <= t.max && Number(t.term) === termNum
    );
    if (tier) {
      return {
        rate: tier.rate,
        type: 'default',
        source: `Down ${tier.min === 0 && tier.max < 20 ? `< ${tier.max + 1}` : `${tier.min}-${tier.max}`}% · ${termNum} เดือน`
      };
    }
    // 3. fallback — match เฉพาะ down%
    const tierByDown = modeData.default.find(t => downPct >= t.min && downPct <= t.max);
    if (tierByDown) {
      return {
        rate: tierByDown.rate,
        type: 'default',
        source: `Down ${tierByDown.min === 0 && tierByDown.max < 20 ? `< ${tierByDown.max + 1}` : `${tierByDown.min}-${tierByDown.max}`}% (fallback)`
      };
    }
    const middleTier = modeData.default[Math.floor(modeData.default.length / 2)];
    return { rate: middleTier.rate, type: 'default', source: 'Default (out of range)' };
  }
  return null;
};

// ============ CAR DATABASE ============
const DEFAULT_CAR_DB = [
  { model: "2 - 220 Gran Coupe M Sport Pro", retail: 2079000, bsiStd: 2199000, bsiUlt: 2319000, bsiPkg: 120000, gfv: 1247400 },
  { model: "3 - 320d M Sport LCI2", retail: 2679000, bsiStd: 2799000, bsiUlt: 2939000, bsiPkg: 140000, gfv: 1205500 },
  { model: "3 - 320Li M Sport LCI2", retail: 2779000, bsiStd: 2899000, bsiUlt: 3039000, bsiPkg: 140000, gfv: 1250550 },
  { model: "3 - 330 Li M Sport LCI", retail: 3009000, bsiStd: 3129000, bsiUlt: 3269000, bsiPkg: 140000, gfv: 1053150 },
  { model: "3 - 330e M Sport LCI2", retail: 2879000, bsiStd: 2999000, bsiUlt: 3139000, bsiPkg: 140000, gfv: 1727400 },
  { model: "3 - M340i xDrive LCI2", retail: 3879000, bsiStd: 3999000, bsiUlt: 4139000, bsiPkg: 140000, gfv: 1745550 },
  { model: "4 - 420i Coupe M Sport LCI", retail: 3479000, bsiStd: 3599000, bsiUlt: 3739000, bsiPkg: 140000, gfv: 1565550 },
  { model: "4 - 430i Convertible M Sport LCI", retail: 4379000, bsiStd: 4499000, bsiUlt: 4639000, bsiPkg: 140000, gfv: 1970550 },
  { model: "4 - 430i Coupe M Sport LCI", retail: 3979000, bsiStd: 4099000, bsiUlt: 4239000, bsiPkg: 140000, gfv: 1790550 },
  { model: "4 - M440i xDrive Coupe LCI", retail: 5179000, bsiStd: 5299000, bsiUlt: 5439000, bsiPkg: 140000, gfv: 2330550 },
  { model: "5 - 520d M Sport", retail: 3609000, bsiStd: 3799000, bsiUlt: 3999000, bsiPkg: 200000, gfv: 1804500 },
  { model: "5 - 520d M Sport Pro", retail: 3609000, bsiStd: 3799000, bsiUlt: 3999000, bsiPkg: 200000, gfv: 1804500 },
  { model: "5 - 530e Inspiring", retail: 3109000, bsiStd: 3299000, bsiUlt: 3499000, bsiPkg: 200000, gfv: 1554500 },
  { model: "5 - 530e M Sport", retail: 3609000, bsiStd: 3799000, bsiUlt: 3999000, bsiPkg: 200000, gfv: 1804500 },
  { model: "5 - 530e M Sport Pro", retail: 3779000, bsiStd: 3969000, bsiUlt: 4169000, bsiPkg: 200000, gfv: 1889500 },
  { model: "7 - 740d M Sport", retail: 6549000, bsiStd: 6739000, bsiUlt: 6939000, bsiPkg: 200000, gfv: 2947050 },
  { model: "7 - 750e xDrive M Sport", retail: 6869000, bsiStd: 7059000, bsiUlt: 7259000, bsiPkg: 200000, gfv: 3091050 },
  { model: "7 - M760e xDrive", retail: 7229000, bsiStd: 7419000, bsiUlt: 7619000, bsiPkg: 200000, gfv: 3253050 },
  { model: "i5 - i5 eDrive40 M Sport", retail: 3299000, bsiStd: 3499000, bsiUlt: 3719000, bsiPkg: 220000, gfv: 1919600 },
  { model: "iX1 - iX1 eDrive20L M Sport", retail: 2359000, bsiStd: 2499000, bsiUlt: 2649000, bsiPkg: 150000, gfv: 1415400 },
  { model: "iX2 - iX2 xDrive30e M Sport", retail: 3259000, bsiStd: 3399000, bsiUlt: 3549000, bsiPkg: 150000, gfv: 1466550 },
  { model: "iX3 - iX3 M Sport (Inspiring)", retail: 2859000, bsiStd: 2999000, bsiUlt: 3149000, bsiPkg: 150000, gfv: 1286550 },
  { model: "X1 - X1 sDrive20i M Sport", retail: 2279000, bsiStd: 2399000, bsiUlt: 2519000, bsiPkg: 120000, gfv: 1367400 },
  { model: "X1 - X1 sDrive20i M Sport*", retail: 2509000, bsiStd: 2619000, bsiUlt: 2739000, bsiPkg: 120000, gfv: 1254500 },
  { model: "X3 - X3 20d xDrive M Sport Pro", retail: 3679000, bsiStd: 3799000, bsiUlt: 3939000, bsiPkg: 140000, gfv: 1839500 },
  { model: "X3 - X3 M50 xDrive", retail: 4379000, bsiStd: 4499000, bsiUlt: 4639000, bsiPkg: 140000, gfv: 2189500 },
  { model: "X4 - X4 xDrive20d M Sport", retail: 4069000, bsiStd: 4189000, bsiUlt: 4329000, bsiPkg: 140000, gfv: 1831050 },
  { model: "X5 - X5 xDrive30d M Sport", retail: 4969000, bsiStd: 5159000, bsiUlt: 5359000, bsiPkg: 200000, gfv: 2236050 },
  { model: "X5 - X5 xDrive50d M Sport", retail: 5269000, bsiStd: 5459000, bsiUlt: 5659000, bsiPkg: 200000, gfv: 2371050 },
  { model: "X6 - X6 xDrive40i M Sport", retail: 5769000, bsiStd: 5959000, bsiUlt: 6159000, bsiPkg: 200000, gfv: 2569050 },
  { model: "X7 - X7 xDrive40d M Sport", retail: 6469000, bsiStd: 6659000, bsiUlt: 6859000, bsiPkg: 200000, gfv: 2911050 },
];

// ============ FINANCIAL FUNCTIONS ============
const PMT = (rate, nper, pv, fv = 0) => {
  if (rate === 0) return -(pv + fv) / nper;
  return -(pv * Math.pow(1 + rate, nper) + fv) * rate / (Math.pow(1 + rate, nper) - 1);
};

const PV = (rate, nper, pmt, fv = 0) => {
  if (rate === 0) return -(pmt * nper + fv);
  return -(pmt * (Math.pow(1 + rate, nper) - 1) / rate + fv) / Math.pow(1 + rate, nper);
};

const RATE = (nper, pmt, pv, fv = 0, guess = 0.1) => {
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

const MODES = {
  HP:     { label:"HP",    fullName:"Hire Purchase",   thaiName:"เช่าซื้อ",          rateLabel:"Flat Rate", hasBalloon:false, hasGFV:false, hasDeposit:false, hasRV:false },
  "HP-BL":{ label:"HP-BL", fullName:"HP Balloon",      thaiName:"เช่าซื้อ+Balloon",  rateLabel:"Eff. Rate", hasBalloon:true,  hasGFV:false, hasDeposit:false, hasRV:false },
  FC:     { label:"FC",    fullName:"Freedom Choice",  thaiName:"ฟรีดอม ชอยส์",     rateLabel:"Eff. Rate", hasBalloon:false, hasGFV:true,  hasDeposit:false, hasRV:false },
  FL:     { label:"FL",    fullName:"Financial Lease", thaiName:"ลีสซิ่ง",           rateLabel:"Eff. Rate", hasBalloon:true,  hasGFV:false, hasDeposit:true,  hasRV:true  },
  "FL-BL":{ label:"FL-BL", fullName:"FL Balloon",      thaiName:"ลีสซิ่ง+Balloon",  rateLabel:"Eff. Rate", hasBalloon:true,  hasGFV:false, hasDeposit:true,  hasRV:true  },
};

const DEFAULT_INPUTS = {
  HP:     { carPrice:0, downPct:25, accessory:0, bsi:0, term:60, sfFlatRate:1.99, addInterest:0 },
  "HP-BL":{ carPrice:0, downPct:25, balloonPct:30, accessory:0, bsi:0, term:60, sfEffRate:7.66, addInterest:0 },
  FC:     { carPrice:0, downPct:25, gfv:0, accessory:0, bsi:0, term:48, sfEffRate:7.50, addInterest:0 },
  FL:     { carPrice:0, depositPct:25, balloonPct:0, accessory:0, bsi:0, term:60, sfEffRate:8.44, addInterest:1.72 },
  "FL-BL":{ carPrice:0, depositPct:25, balloonPct:40, accessory:0, bsi:0, term:60, sfEffRate:6.86, addInterest:0 },
};

const calculate = (mode, inputs, discount = 0) => {
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

const fmtB=n=>(!isFinite(n)||isNaN(n))?"0":Math.round(n).toLocaleString("en-US");
const fmtB2=n=>(!isFinite(n)||isNaN(n))?"0":n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtP=n=>(!isFinite(n)||isNaN(n))?"0.00%":(n*100).toFixed(2)+"%";

// ============ CAR SELECTOR ============
function CarSelector({value,onSelect,carDB}) {
  const[open,setOpen]=useState(false),[search,setSearch]=useState("");
  const ref=useRef(null);
  useEffect(()=>{
    const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("mousedown",h);
    return()=>document.removeEventListener("mousedown",h);
  },[]);
  const filtered=useMemo(()=>!search?carDB:carDB.filter(c=>c.model.toLowerCase().includes(search.toLowerCase())),[search,carDB]);
  const groups=useMemo(()=>{
    const g={};
    filtered.forEach(c=>{const s=c.model.split(" - ")[0].trim(); if(!g[s])g[s]=[]; g[s].push(c);});
    return g;
  },[filtered]);
  
  return(
    <div ref={ref} className="relative">
      <button onClick={()=>setOpen(!open)}
        className="w-full flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-left text-sm focus:border-[#1c69d4] focus:outline-none hover:border-[#1c69d4]">
        <span className={value?"text-neutral-900 font-medium":"text-neutral-400"}>{value||"เลือกรุ่นรถ BMW..."}</span>
        <ChevronDown size={16} className={`text-neutral-400 transition-transform ${open?"rotate-180":""}`}/>
      </button>
      {open&&(
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-neutral-200 bg-white shadow-xl overflow-hidden">
          <div className="p-2 border-b border-neutral-100">
            <div className="flex items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2">
              <Search size={14} className="text-neutral-400 shrink-0"/>
              <input autoFocus type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหารุ่นรถ..."
                className="w-full bg-transparent text-sm outline-none placeholder:text-neutral-400"/>
              {search&&<button onClick={()=>setSearch("")}><X size={12} className="text-neutral-400"/></button>}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {Object.entries(groups).map(([series,cars])=>(
              <div key={series}>
                <div className="sticky top-0 bg-neutral-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500 border-b border-neutral-100">
                  Series {series}
                </div>
                {cars.map(car=>(
                  <button key={car.model} onClick={()=>{onSelect(car);setOpen(false);setSearch("");}}
                    className={`w-full px-3 py-2.5 text-left hover:bg-[#1c69d4]/5 transition-colors ${value===car.model?"bg-[#1c69d4]/10":""}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-neutral-800">{car.model.split(" - ").slice(1).join(" - ")}</span>
                      {value===car.model&&<Check size={14} className="text-[#1c69d4] shrink-0"/>}
                    </div>
                    <div className="mt-0.5 flex gap-3 text-[10px] text-neutral-500">
                      <span>BSI Std: {fmtB(car.bsiStd)}</span>
                      {car.gfv>0&&<span className="text-[#1c69d4]">GFV: {fmtB(car.gfv)}</span>}
                    </div>
                  </button>
                ))}
              </div>
            ))}
            {filtered.length===0&&<div className="py-8 text-center text-sm text-neutral-500">ไม่พบรุ่นที่ค้นหา</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ============ BSI SELECTOR ============
function BSISelector({car,selected,onSelect}) {
  if(!car)return null;
  const opts=[
    {label:"Retail",price:car.retail,desc:"ไม่รวม BSI"},
    {label:"BSI Standard",price:car.bsiStd,desc:`+${fmtB(car.bsiPkg)}`},
    {label:"BSI Ultimate",price:car.bsiUlt,desc:"แพคเกจสูงสุด"},
  ];
  return(
    <div className="grid grid-cols-3 gap-1.5">
      {opts.map(opt=>{
        const active=selected===opt.price;
        return(
          <button key={opt.label} onClick={()=>onSelect(opt.price)}
            className={`relative rounded-lg border p-2 text-left transition-all ${active?"border-[#1c69d4] bg-[#1c69d4]/5 ring-2 ring-[#1c69d4]/20":"border-neutral-200 bg-white hover:border-[#1c69d4] hover:bg-[#1c69d4]/5"}`}>
            {active&&<div className="absolute top-1 right-1"><Check size={12} className="text-[#1c69d4]"/></div>}
            <div className="text-[9px] font-bold uppercase tracking-wide text-neutral-500">{opt.label}</div>
            <div className="mt-1 text-xs font-bold tabular-nums text-neutral-900">{fmtB(opt.price)}</div>
            <div className="text-[9px] text-neutral-400">{opt.desc}</div>
          </button>
        );
      })}
    </div>
  );
}

// ============ NUMBER INPUT ============
function NumberInput({label,value,onChange,suffix,hint,accent}){
  const [localVal,setLocalVal]=useState("");
  useEffect(()=>{ setLocalVal(value?.toString()||""); },[value]);
  
  const handle=v=>{
    const c=v.replace(/,/g,"");
    if(c===""||/^-?\d*\.?\d*$/.test(c)){
      setLocalVal(c);
      onChange(c);
    }
  };
  const display=localVal===""?"":localVal.includes(".")?localVal:Number(localVal||0).toLocaleString("en-US");
  
  return(
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label className="text-[11px] font-medium tracking-wider uppercase text-neutral-500">{label}</label>
        {hint&&<span className="text-[10px] text-neutral-400">{hint}</span>}
      </div>
      <div className={`relative flex items-center rounded-lg border transition-all ${accent?"border-[#1c69d4] bg-[#1c69d4]/[0.03]":"border-neutral-200 bg-white"} focus-within:border-[#1c69d4] focus-within:ring-2 focus-within:ring-[#1c69d4]/10`}>
        <input type="text" inputMode="decimal" value={display} onChange={e=>handle(e.target.value)}
          className="w-full bg-transparent px-3 py-2.5 text-[15px] font-medium text-neutral-900 outline-none tabular-nums"/>
        {suffix&&<span className="pr-3 text-xs font-medium text-neutral-400">{suffix}</span>}
      </div>
    </div>
  );
}

// ============ MODE BUTTON ============
function ModeButton({modeKey,active,onClick}){
  const m=MODES[modeKey];
  return(
    <button onClick={onClick}
      className={`flex flex-col items-center justify-center rounded-lg px-2 py-2.5 text-center transition-all border-2 ${
        active
        ?"bg-gradient-to-b from-[#1c69d4] to-[#1557b0] text-neutral-900 shadow-xl border-[#1557b0] scale-110 ring-2 ring-[#1c69d4]/50"
        :"bg-white text-neutral-600 hover:bg-neutral-50 border-neutral-200 hover:border-[#1c69d4]/30"
      }`}>
      <span className={`text-[12px] font-bold tracking-tight ${active?"drop-shadow-lg":""}`}>{m.label}</span>
      <span className={`text-[9px] mt-0.5 ${active?"text-neutral-700":"text-neutral-500"}`}>{m.thaiName}</span>
    </button>
  );
}

function StatRow({label,value,accent}){
  return(
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="text-[11px] text-neutral-500 tracking-wide">{label}</span>
      <span className={`tabular-nums font-semibold text-sm ${accent?"text-[#1c69d4]":"text-neutral-900"}`}>{value}</span>
    </div>
  );
}

// ============ CAR MANAGER ============
function CarManager({carDB,onSave,onClose,onBack}){
  const[cars,setCars]=useState([...carDB]);
  const[editing,setEditing]=useState(null);
  
  const addNew=()=>{
    setCars([...cars,{model:"",retail:0,bsiStd:0,bsiUlt:0,bsiPkg:0,gfv:0}]);
    setEditing(cars.length);
  };
  
  const save=()=>{ 
    // Validation: ตรวจสอบว่ารถที่มีชื่อต้องมีราคา BSI Standard > 0
    const invalid = cars.find(c => c.model && c.bsiStd <= 0);
    if (invalid) {
      alert('❌ กรุณากรอกราคา BSI Standard มากกว่า 0 สำหรับรุ่น: ' + invalid.model);
      return;
    }
    
    // Validation: ตรวจสอบว่ามีรถที่ไม่ได้กรอกชื่อไหม
    const noName = cars.find((c,i) => !c.model && editing !== i && (c.retail > 0 || c.bsiStd > 0));
    if (noName) {
      alert('❌ พบรุ่นรถที่ยังไม่ได้ตั้งชื่อ กรุณากรอกชื่อรุ่น');
      return;
    }
    
    onSave(cars.filter(c=>c.model));
    if(onBack)onBack();
    else onClose(); 
  };
  
  return(
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end" onClick={onClose}>
      <div className="w-full max-w-2xl mx-auto bg-white rounded-t-2xl max-h-[90vh] flex flex-col" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
          {onBack&&(
            <button onClick={save} className="rounded-full p-1.5 hover:bg-neutral-100" title="กลับ">
              <ChevronRight size={18} className="rotate-180"/>
            </button>
          )}
          <h3 className="text-sm font-bold text-neutral-900">จัดการรถในฐานข้อมูล</h3>
          <div className="flex gap-2">
            <button onClick={save} className="rounded-lg border-2 border-neutral-200 bg-white text-neutral-700 px-3 py-1.5 text-xs font-semibold hover:bg-neutral-50">บันทึก</button>
            <button onClick={onClose} className="rounded-full p-1.5 hover:bg-neutral-100"><X size={16}/></button>
          </div>
        </div>
        <div className="overflow-auto flex-1 p-4 space-y-2">
          {cars.map((c,i)=>(
            <div key={i} className="border border-neutral-200 rounded-lg p-3">
              {editing===i?(
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1 block">ชื่อรุ่น</label>
                    <input value={c.model} onChange={e=>{const n=[...cars]; n[i].model=e.target.value; setCars(n);}}
                      placeholder="เช่น 3 - 320Li M Sport LCI2" className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1 block">Retail Price</label>
                      <input type="number" value={c.retail} onChange={e=>{const n=[...cars]; n[i].retail=Number(e.target.value)||0; setCars(n);}}
                        className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"/>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1 block">BSI Standard</label>
                      <input type="number" value={c.bsiStd} onChange={e=>{const n=[...cars]; n[i].bsiStd=Number(e.target.value)||0; setCars(n);}}
                        className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"/>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1 block">BSI Ultimate</label>
                      <input type="number" value={c.bsiUlt} onChange={e=>{const n=[...cars]; n[i].bsiUlt=Number(e.target.value)||0; setCars(n);}}
                        className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"/>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1 block">BSI Package</label>
                      <input type="number" value={c.bsiPkg} onChange={e=>{const n=[...cars]; n[i].bsiPkg=Number(e.target.value)||0; setCars(n);}}
                        className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"/>
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1 block">GFV (Freedom Choice)</label>
                      <input type="number" value={c.gfv} onChange={e=>{const n=[...cars]; n[i].gfv=Number(e.target.value)||0; setCars(n);}}
                        className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"/>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={()=>setEditing(null)} className="flex-1 rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium hover:bg-neutral-200">เสร็จ</button>
                    <button onClick={()=>{setCars(cars.filter((_,idx)=>idx!==i)); setEditing(null);}} className="rounded-lg bg-red-50 text-red-600 px-3 py-2 text-sm font-medium hover:bg-red-100">ลบ</button>
                  </div>
                </div>
              ):(
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-neutral-900 mb-2">{c.model||"(ยังไม่ตั้งชื่อ)"}</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                      <div className="flex justify-between"><span className="text-neutral-500">Retail:</span><span className="font-medium tabular-nums">{fmtB(c.retail)}</span></div>
                      <div className="flex justify-between"><span className="text-neutral-500">BSI Std:</span><span className="font-medium tabular-nums">{fmtB(c.bsiStd)}</span></div>
                      <div className="flex justify-between"><span className="text-neutral-500">BSI Ult:</span><span className="font-medium tabular-nums">{fmtB(c.bsiUlt)}</span></div>
                      <div className="flex justify-between"><span className="text-neutral-500">BSI Pkg:</span><span className="font-medium tabular-nums">{fmtB(c.bsiPkg)}</span></div>
                      {c.gfv>0&&<div className="col-span-2 flex justify-between border-t border-neutral-100 pt-1 mt-1"><span className="text-[#1c69d4]">GFV:</span><span className="font-medium tabular-nums text-[#1c69d4]">{fmtB(c.gfv)}</span></div>}
                    </div>
                  </div>
                  <button onClick={()=>setEditing(i)} className="rounded-lg p-2 hover:bg-neutral-100 ml-2"><Edit2 size={16}/></button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-neutral-200">
          <button onClick={addNew} className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-neutral-300 py-2.5 text-sm text-neutral-600 hover:border-[#1c69d4] hover:text-[#1c69d4]">
            <Plus size={16}/>เพิ่มรุ่นใหม่
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ FREEBIE MANAGER ============
function FreebieManager({items,onSave,onClose,onBack}){
  const[freebies,setFreebies]=useState(items);
  const[editing,setEditing]=useState(null);
  const[editData,setEditData]=useState({name:"",detail:"",cost:0});
  
  const addNew=()=>{
    setEditing("new");
    setEditData({name:"",detail:"",cost:0});
  };
  
  const editItem=item=>{
    setEditing(item.id);
    setEditData({name:item.name,detail:item.detail,cost:item.cost});
  };
  
  const saveEdit=()=>{
    if(!editData.name||editData.cost<=0){
      alert("❌ กรุณากรอกข้อมูลให้ครบถ้วน\n- ชื่อของแถม\n- ต้นทุน (มากกว่า 0)");
      return;
    }
    
    if(editing==="new"){
      const newItem={
        id:`fb-${Date.now()}`,
        name:editData.name,
        detail:editData.detail,
        cost:Number(editData.cost)
      };
      setFreebies([...freebies,newItem]);
    }else{
      setFreebies(freebies.map(f=>
        f.id===editing
        ?{...f,name:editData.name,detail:editData.detail,cost:Number(editData.cost)}
        :f
      ));
    }
    
    setEditing(null);
    setEditData({name:"",detail:"",cost:0});
  };
  
  const deleteItem=id=>{
    const item=freebies.find(f=>f.id===id);
    if(!item)return;
    if(!confirm(`ต้องการลบรายการนี้?\n\n"${item.name}"\nต้นทุน: ${item.cost.toLocaleString()} บาท\n\nการกระทำนี้ไม่สามารถย้อนกลับได้`)){
      return;
    }
    setFreebies(freebies.filter(f=>f.id!==id));
  };
  
  const save=()=>{
    onSave(freebies);
    if(onBack)onBack();
    else onClose();
  };
  
  return(
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end" onClick={onClose}>
      <div className="w-full max-w-2xl mx-auto bg-white rounded-t-2xl max-h-[90vh] flex flex-col" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
          {onBack&&(
            <button onClick={save} className="rounded-full p-1.5 hover:bg-neutral-100" title="กลับ">
              <ChevronRight size={18} className="rotate-180"/>
            </button>
          )}
          <h3 className="text-sm font-bold text-neutral-900">จัดการรายการของแถม</h3>
          <div className="flex gap-2">
            <button onClick={save} className="rounded-lg border-2 border-neutral-200 bg-white text-neutral-700 px-3 py-1.5 text-xs font-semibold hover:bg-neutral-50">บันทึก</button>
            <button onClick={onClose} className="rounded-full p-1.5 hover:bg-neutral-100"><X size={16}/></button>
          </div>
        </div>
        
        <div className="overflow-auto flex-1 p-4">
          <div className="text-xs font-medium text-neutral-600 mb-3">📦 รายการทั้งหมด ({freebies.length} รายการ)</div>
          
          <div className="space-y-2">
            {freebies.map(item=>(
              <div key={item.id} className="border border-neutral-200 rounded-lg p-3 bg-white hover:bg-neutral-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-semibold text-neutral-900 text-sm">{item.name}</div>
                    {item.detail&&<div className="text-xs text-neutral-600 mt-0.5">{item.detail}</div>}
                    <div className="text-xs text-neutral-500 mt-1">ต้นทุน: {item.cost.toLocaleString()} บาท</div>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <button onClick={()=>editItem(item)} className="rounded-lg p-2 hover:bg-blue-100 text-blue-600 transition-colors">
                      <Edit2 size={16}/>
                    </button>
                    <button onClick={()=>deleteItem(item.id)} className="rounded-lg p-2 hover:bg-red-100 text-red-600 transition-colors">
                      <Trash2 size={16}/>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <button onClick={addNew}
            className="w-full mt-3 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-neutral-300 py-3 text-sm font-medium text-neutral-700 hover:border-[#1c69d4] hover:text-[#1c69d4] hover:bg-blue-50">
            <Plus size={16}/>เพิ่มรายการของแถม
          </button>
        </div>
      </div>
      
      {/* Edit Dialog */}
      {editing&&(
        <div className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4" onClick={()=>setEditing(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full" onClick={e=>e.stopPropagation()}>
            <h3 className="text-lg font-bold text-neutral-900 mb-4">{editing==="new"?"เพิ่ม":"แก้ไข"}รายการของแถม</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-1">ชื่อของแถม *</label>
                <input type="text" value={editData.name} onChange={e=>setEditData({...editData,name:e.target.value})}
                  placeholder="เช่น BSI Ultimate (5 ปี)"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-[#1c69d4] focus:ring-2 focus:ring-[#1c69d4]/10"/>
              </div>
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-1">รายละเอียด</label>
                <input type="text" value={editData.detail} onChange={e=>setEditData({...editData,detail:e.target.value})}
                  placeholder="เช่น 5 ปี / 100,000 กม."
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-[#1c69d4] focus:ring-2 focus:ring-[#1c69d4]/10"/>
              </div>
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-1">ต้นทุน (บาท) *</label>
                <input type="number" value={editData.cost} onChange={e=>setEditData({...editData,cost:e.target.value})}
                  placeholder="45000"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-[#1c69d4] focus:ring-2 focus:ring-[#1c69d4]/10"/>
                <p className="text-xs text-neutral-500 mt-1">💡 ต้นทุนนี้ใช้คำนวณงบ Rebate ที่ต้องการ</p>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={()=>setEditing(null)} className="flex-1 rounded-lg border-2 border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">ยกเลิก</button>
              <button onClick={saveEdit} className="flex-1 rounded-lg border-2 border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ PROMOTION MANAGER ============
function PromotionManager({currentPromoId,promotions,onSave,onClose,onBack}){
  const[promos,setPromos]=useState(promotions);
  const[activePromo,setActivePromo]=useState(currentPromoId);
  const[editingMode,setEditingMode]=useState("");
  const[editingSpecial,setEditingSpecial]=useState(null);
  const[editingTier,setEditingTier]=useState(null);

  const currentPromo=promos[activePromo]||{...DEFAULT_PROMOTION};
  const activeTerms=(currentPromo.terms||[48,60]).map(Number).sort((a,b)=>a-b);
  const AVAILABLE_TERMS=[48,60,72,84];

  const toggleTerm=(term)=>{
    setPromos(prev=>{
      const updated={...prev};
      const cur=updated[activePromo]||{...DEFAULT_PROMOTION};
      const curTerms=cur.terms||[48,60];
      const newTerms=curTerms.includes(term)
        ? curTerms.filter(t=>t!==term)
        : [...curTerms,term].sort((a,b)=>a-b);
      updated[activePromo]={...cur,terms:newTerms};
      return updated;
    });
  };

  const addCustomTerm=(termVal)=>{
    const t=Number(termVal);
    if(!t||t<12||t>120){alert("❌ Term ต้องอยู่ระหว่าง 12-120 เดือน");return;}
    if(activeTerms.includes(t)){alert("❌ Term นี้มีอยู่แล้ว");return;}
    setPromos(prev=>{
      const updated={...prev};
      const cur=migratePromotion(updated[activePromo]||{...DEFAULT_PROMOTION});
      const newTerms=[...(cur.terms||[48,60]),t].sort((a,b)=>a-b);
      const newPromo={...cur,terms:newTerms};
      ["HP","HP-BL","FC","FL","FL-BL"].forEach(m=>{
        if(!newPromo[m])newPromo[m]={default:[],special:[]};
        const existingDownGroups=[...new Set((newPromo[m].default||[]).map(r=>`${r.min}-${r.max}`))];
        const newRows=existingDownGroups.length>0
          ? existingDownGroups.map(g=>{const[min,max]=g.split("-").map(Number);return{min,max,term:t,rate:0};})
          : [{min:20,max:35,term:t,rate:0},{min:0,max:19,term:t,rate:0}];
        newPromo[m]={...newPromo[m],default:[...newPromo[m].default,...newRows]};
      });
      updated[activePromo]=newPromo;
      return updated;
    });
  };

  const updateRate=(modeKey,downMin,downMax,term,newRate)=>{
    setPromos(prev=>{
      const updated={...prev};
      if(!updated[activePromo])updated[activePromo]={...DEFAULT_PROMOTION};
      if(!updated[activePromo][modeKey])updated[activePromo][modeKey]={default:[],special:[]};
      updated[activePromo][modeKey]={
        ...updated[activePromo][modeKey],
        default:updated[activePromo][modeKey].default.map(r=>
          r.min===downMin&&r.max===downMax&&Number(r.term)===Number(term)
            ?{...r,rate:newRate}
            :r
        )
      };
      return updated;
    });
  };

  const addDownTier=(modeKey,downMin,downMax)=>{
    const min=Number(downMin),max=Number(downMax);
    if(isNaN(min)||isNaN(max)||min<0||max>100||min>=max){alert("❌ ช่วงเงินดาวน์ไม่ถูกต้อง");return;}
    setPromos(prev=>{
      const updated={...prev};
      if(!updated[activePromo][modeKey])updated[activePromo][modeKey]={default:[],special:[]};
      const newRows=activeTerms.map(t=>({min,max,term:t,rate:0}));
      updated[activePromo][modeKey]={
        ...updated[activePromo][modeKey],
        default:[...updated[activePromo][modeKey].default,...newRows]
      };
      return updated;
    });
    setEditingTier(null);
  };

  const deleteDownTier=(modeKey,downMin,downMax)=>{
    if(!confirm(`ลบ tier Down ${downMin}-${downMax}% ออกทั้งหมด?`))return;
    setPromos(prev=>{
      const updated={...prev};
      updated[activePromo][modeKey]={
        ...updated[activePromo][modeKey],
        default:updated[activePromo][modeKey].default.filter(r=>!(r.min===downMin&&r.max===downMax))
      };
      return updated;
    });
  };

  const addSpecialRate=(mode)=>{setEditingMode(mode);setEditingSpecial({model:"",downMin:20,downMax:35,rate:0});};

  const saveSpecialRate=()=>{
    if(!editingSpecial||!editingSpecial.model||editingSpecial.rate<=0){
      alert("❌ กรุณากรอกข้อมูลให้ครบถ้วน\n- รุ่นรถ\n- อัตราดอกเบี้ย (มากกว่า 0)");
      return;
    }
    if(editingSpecial.downMin<0||editingSpecial.downMax>100||editingSpecial.downMin>=editingSpecial.downMax){
      alert("❌ ช่วงเงินดาวน์ไม่ถูกต้อง");return;
    }
    setPromos(prev=>{
      const updated={...prev};
      if(!updated[activePromo])updated[activePromo]={...DEFAULT_PROMOTION};
      if(!updated[activePromo][editingMode])updated[activePromo][editingMode]={default:[],special:[]};
      updated[activePromo][editingMode]={
        ...updated[activePromo][editingMode],
        special:[...(updated[activePromo][editingMode].special||[]),editingSpecial]
      };
      return updated;
    });
    setEditingSpecial(null);setEditingMode("");
  };

  const deleteSpecialRate=(mode,index)=>{
    if(!confirm("ต้องการลบอัตราพิเศษนี้?"))return;
    setPromos(prev=>{
      const updated={...prev};
      const newSpecial=[...updated[activePromo][mode].special];
      newSpecial.splice(index,1);
      updated[activePromo][mode]={...updated[activePromo][mode],special:newSpecial};
      return updated;
    });
  };

  const save=()=>{
    for(const modeKey of ["HP","HP-BL","FC","FL","FL-BL"]){
      const rows=promos[activePromo]?.[modeKey]?.default||[];
      for(const row of rows){
        const r=parseFloat(row.rate);
        if(isNaN(r)||r<0||r>50){
          alert(`❌ อัตราดอกเบี้ยไม่ถูกต้องใน ${modeKey}\nต้องอยู่ระหว่าง 0-50%`);
          return;
        }
      }
    }
    onSave({currentPromo:activePromo,promotions:promos});
    if(onBack)onBack();else onClose();
  };

  const buildGrid=(modeKey)=>{
    const promo=migratePromotion(currentPromo);
    const rows=promo[modeKey]?.default||[];
    const groups={};
    rows.forEach(r=>{
      const key=`${r.min}-${r.max}`;
      if(!groups[key])groups[key]={min:r.min,max:r.max,rates:{}};
      groups[key].rates[Number(r.term)]=r.rate;
    });
    return Object.values(groups).sort((a,b)=>b.min-a.min);
  };

  return(
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end" onClick={onClose}>
      <div className="w-full max-w-2xl mx-auto bg-white rounded-t-2xl max-h-[90vh] flex flex-col" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
          {onBack&&(<button onClick={save} className="rounded-full p-1.5 hover:bg-neutral-100" title="กลับ"><ChevronRight size={18} className="rotate-180"/></button>)}
          <h3 className="text-sm font-bold text-neutral-900">จัดการโปรโมชั่น</h3>
          <div className="flex gap-2">
            <button onClick={save} className="rounded-lg border-2 border-neutral-200 bg-white text-neutral-700 px-3 py-1.5 text-xs font-semibold hover:bg-neutral-50">บันทึก</button>
            <button onClick={onClose} className="rounded-full p-1.5 hover:bg-neutral-100"><X size={16}/></button>
          </div>
        </div>
        <div className="overflow-auto flex-1 p-4 space-y-4">
          <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3">
            <label className="block text-xs font-medium text-neutral-600 mb-2">โปรโมชั่นปัจจุบัน</label>
            <select value={activePromo} onChange={e=>setActivePromo(e.target.value)} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm bg-white">
              {Object.keys(promos).map(id=>(<option key={id} value={id}>{promos[id].month||id}</option>))}
            </select>
          </div>
          <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3">
            <span className="block text-xs font-medium text-neutral-600 mb-2">ระยะเวลาผ่อน (Terms) ที่ใช้</span>
            <div className="flex flex-wrap gap-2 mb-2">
              {AVAILABLE_TERMS.map(t=>(
                <button key={t} onClick={()=>toggleTerm(t)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${activeTerms.includes(t)?"bg-[#1c69d4] text-white":"border border-neutral-300 text-neutral-500 hover:border-[#1c69d4]"}`}>
                  {t} เดือน
                </button>
              ))}
              {activeTerms.filter(t=>!AVAILABLE_TERMS.includes(t)).map(t=>(
                <button key={t} onClick={()=>toggleTerm(t)} className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[#1c69d4] text-white">
                  {t} เดือน ✕
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input id="custom-term-input" type="number" placeholder="กำหนดเอง เช่น 36" className="flex-1 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm"/>
              <button onClick={()=>{const v=document.getElementById("custom-term-input").value;addCustomTerm(v);document.getElementById("custom-term-input").value="";}}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 flex items-center gap-1">
                <Plus size={13}/>เพิ่ม
              </button>
            </div>
          </div>
          {["HP","HP-BL","FC","FL","FL-BL"].map(modeKey=>{
            const modeData=migratePromotion(currentPromo)[modeKey]||{default:[],special:[]};
            const m=MODES[modeKey];
            const grid=buildGrid(modeKey);
            return(
              <div key={modeKey} className="border border-neutral-200 rounded-lg overflow-hidden">
                <div className="bg-gradient-to-r from-neutral-100 to-neutral-50 border-b border-neutral-200 px-3 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-neutral-900">{m.label}</span>
                    <span className="text-xs text-neutral-600">{m.fullName}</span>
                  </div>
                  <span className="text-[10px] font-medium bg-neutral-200 text-neutral-700 px-2 py-0.5 rounded">{m.rateLabel}</span>
                </div>
                <div className="p-3 space-y-3">
                  <div className="text-xs font-semibold text-neutral-700">อัตราพื้นฐาน (%)</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr>
                          <th className="text-left py-1.5 px-2 text-neutral-500 font-medium bg-neutral-50 rounded-tl-lg">เงินดาวน์</th>
                          {activeTerms.map(t=>(<th key={t} className="text-center py-1.5 px-2 text-neutral-500 font-medium bg-neutral-50">{t} เดือน</th>))}
                          <th className="bg-neutral-50 rounded-tr-lg w-8 py-1.5"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {grid.map((row,idx)=>(
                          <tr key={`${row.min}-${row.max}`} className={idx%2===0?"bg-white":"bg-neutral-50/50"}>
                            <td className="py-2 px-2 font-semibold text-neutral-700 whitespace-nowrap">
                              {row.min===0&&row.max<20?`< ${row.max+1}%`:row.max>=100?`> ${row.min-1}%`:`${row.min}–${row.max}%`}
                            </td>
                            {activeTerms.map(t=>(
                              <td key={t} className="py-1 px-1 text-center">
                                <input type="text" inputMode="decimal"
                                  value={row.rates[t]??0}
                                  onChange={e=>updateRate(modeKey,row.min,row.max,t,e.target.value)}
                                  className="w-16 rounded-md border border-neutral-200 px-1 py-1 text-xs text-center font-medium text-neutral-900 focus:border-[#1c69d4] focus:outline-none"/>
                              </td>
                            ))}
                            <td className="py-1 px-1 text-center">
                              <button onClick={()=>deleteDownTier(modeKey,row.min,row.max)}
                                className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors">
                                <Trash2 size={13}/>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {editingTier===modeKey?(
                    <div className="flex gap-2 items-center bg-blue-50 border border-blue-200 rounded-lg p-2">
                      <span className="text-xs text-neutral-600 whitespace-nowrap">ดาวน์</span>
                      <input id={`dmin-${modeKey}`} type="number" placeholder="min" className="w-14 rounded border border-neutral-200 px-2 py-1 text-xs text-center"/>
                      <span className="text-xs text-neutral-400">–</span>
                      <input id={`dmax-${modeKey}`} type="number" placeholder="max" className="w-14 rounded border border-neutral-200 px-2 py-1 text-xs text-center"/>
                      <span className="text-xs text-neutral-600">%</span>
                      <button onClick={()=>addDownTier(modeKey,document.getElementById(`dmin-${modeKey}`).value,document.getElementById(`dmax-${modeKey}`).value)}
                        className="rounded-lg bg-[#1c69d4] text-white px-3 py-1 text-xs font-semibold">เพิ่ม</button>
                      <button onClick={()=>setEditingTier(null)} className="text-neutral-400 hover:text-neutral-600 text-xs">ยกเลิก</button>
                    </div>
                  ):(
                    <button onClick={()=>setEditingTier(modeKey)}
                      className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-300 py-1.5 text-xs font-medium text-neutral-500 hover:border-[#1c69d4] hover:text-[#1c69d4] hover:bg-blue-50 transition-colors">
                      <Plus size={13}/>เพิ่ม Down Tier
                    </button>
                  )}
                  {modeData.special.length>0&&(
                    <div className="pt-2 border-t border-neutral-200">
                      <div className="text-xs font-semibold text-neutral-700 mb-2">อัตราพิเศษ ({modeData.special.length} รายการ)</div>
                      {modeData.special.map((spec,idx)=>(
                        <div key={idx} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg p-2 mb-1">
                          <div className="text-xs">
                            <div className="font-semibold text-neutral-900">{spec.model}</div>
                            <div className="text-neutral-600">ดาวน์ {spec.downMin}–{spec.downMax}% → {spec.rate}%</div>
                          </div>
                          <button onClick={()=>deleteSpecialRate(modeKey,idx)} className="rounded-lg p-1.5 hover:bg-red-100 text-red-600 transition-colors"><Trash2 size={16}/></button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button onClick={()=>addSpecialRate(modeKey)}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-amber-300 py-1.5 text-xs font-medium text-amber-700 hover:border-amber-400 hover:bg-amber-50 transition-colors">
                    <Plus size={13}/>เพิ่มอัตราพิเศษ (รายรุ่น)
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {editingSpecial&&(
        <div className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4" onClick={()=>setEditingSpecial(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full" onClick={e=>e.stopPropagation()}>
            <h3 className="text-lg font-bold text-neutral-900 mb-4">เพิ่มอัตราพิเศษ — {MODES[editingMode]?.label}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-1">รุ่นรถ (บางส่วนของชื่อ)</label>
                <input type="text" value={editingSpecial.model} onChange={e=>setEditingSpecial({...editingSpecial,model:e.target.value})}
                  placeholder="เช่น iX1, 530e, X3" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-[#1c69d4]"/>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-semibold text-neutral-700 mb-1">ดาวน์ขั้นต่ำ (%)</label>
                  <input type="number" value={editingSpecial.downMin} onChange={e=>setEditingSpecial({...editingSpecial,downMin:Number(e.target.value)})} className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-[#1c69d4]"/>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-neutral-700 mb-1">ดาวน์สูงสุด (%)</label>
                  <input type="number" value={editingSpecial.downMax} onChange={e=>setEditingSpecial({...editingSpecial,downMax:Number(e.target.value)})} className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-[#1c69d4]"/>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-1">อัตราดอกเบี้ย (%)</label>
                <input type="number" step="0.01" value={editingSpecial.rate} onChange={e=>setEditingSpecial({...editingSpecial,rate:Number(e.target.value)})} className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-[#1c69d4]"/>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={()=>setEditingSpecial(null)} className="flex-1 rounded-lg border-2 border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">ยกเลิก</button>
              <button onClick={saveSpecialRate} className="flex-1 rounded-lg border-2 border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function SettingsDialog({salesName,onSave,onClose,onOpenCarManager,onOpenPromoManager,onOpenFreebieManager,onExport,onImport}){
  const[name,setName]=useState(salesName);
  const[showSubmenu,setShowSubmenu]=useState(null); // null | 'data' | 'backup'
  const fileInputRef=useRef(null);
  
  const save=()=>{ 
    onSave(name); 
    onClose(); 
  };
  
  return(
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          {showSubmenu&&(
            <button onClick={()=>setShowSubmenu(null)} className="rounded-full p-1.5 hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900">
              <ChevronRight size={18} className="rotate-180"/>
            </button>
          )}
          <h3 className="text-lg font-bold text-neutral-900">ตั้งค่า</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900">
            <X size={18}/>
          </button>
        </div>
        
        {/* Content */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-neutral-700 mb-1.5 block">ชื่อ Sales</label>
            <input type="text" value={name} onChange={e=>setName(e.target.value)}
              placeholder="กรอกชื่อของคุณ" 
              className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-[#1c69d4] focus:ring-2 focus:ring-[#1c69d4]/10"/>
            <p className="text-[11px] text-neutral-500 mt-1.5">ชื่อนี้จะถูกใช้ในข้อความ Copy LINE</p>
          </div>
          
          <div className="border-t border-neutral-200 pt-4">
            <label className="text-sm font-medium text-neutral-700 mb-2 block">จัดการข้อมูล</label>
            
            <button onClick={()=>{onClose(); onOpenCarManager();}} 
              className="w-full flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3 text-left hover:bg-neutral-50 transition-colors mb-2">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-neutral-100 p-2">
                  <Settings size={16} className="text-neutral-600"/>
                </div>
                <div>
                  <div className="text-sm font-medium text-neutral-900">จัดการรถในฐานข้อมูล</div>
                  <div className="text-[11px] text-neutral-500">เพิ่ม แก้ไข หรือลบรุ่นรถ</div>
                </div>
              </div>
              <ChevronRight size={16} className="text-neutral-400"/>
            </button>
            
            <button onClick={()=>{onClose(); onOpenPromoManager();}} 
              className="w-full flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3 text-left hover:bg-neutral-50 transition-colors mb-2">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-amber-100 p-2">
                  <span className="text-base">💰</span>
                </div>
                <div>
                  <div className="text-sm font-medium text-neutral-900">จัดการโปรโมชั่น</div>
                  <div className="text-[11px] text-neutral-500">อัตราดอกเบี้ย + Special Rates</div>
                </div>
              </div>
              <ChevronRight size={16} className="text-neutral-400"/>
            </button>
            
            <button onClick={()=>{onClose(); onOpenFreebieManager();}} 
              className="w-full flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3 text-left hover:bg-neutral-50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-green-100 p-2">
                  <span className="text-base">🎁</span>
                </div>
                <div>
                  <div className="text-sm font-medium text-neutral-900">จัดการรายการของแถม</div>
                  <div className="text-[11px] text-neutral-500">ตั้งค่ารายการ + ต้นทุน</div>
                </div>
              </div>
              <ChevronRight size={16} className="text-neutral-400"/>
            </button>
          </div>
          
          <div className="border-t border-neutral-200 pt-4">
            <label className="text-sm font-medium text-neutral-700 mb-2 block">สำรองข้อมูล</label>
            
            <button onClick={onExport}
              className="w-full flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3 text-left hover:bg-neutral-50 transition-colors mb-2">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-green-100 p-2">
                  <Download size={16} className="text-green-600"/>
                </div>
                <div>
                  <div className="text-sm font-medium text-neutral-900">ส่งออกข้อมูลทั้งหมด</div>
                  <div className="text-[11px] text-neutral-500">สำรองรถ + โปรโมชั่น (Backup)</div>
                </div>
              </div>
            </button>
            
            <input ref={fileInputRef} type="file" accept=".json" onChange={onImport} className="hidden"/>
            <button onClick={()=>fileInputRef.current?.click()}
              className="w-full flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3 text-left hover:bg-neutral-50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-100 p-2">
                  <Upload size={16} className="text-blue-600"/>
                </div>
                <div>
                  <div className="text-sm font-medium text-neutral-900">นำเข้าข้อมูลทั้งหมด</div>
                  <div className="text-[11px] text-neutral-500">คืนค่าจากไฟล์ Backup</div>
                </div>
              </div>
            </button>
          </div>
        </div>
        
        {/* Footer - ปุ่มบันทึก */}
        <div className="border-t border-neutral-200 px-6 py-4">
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 rounded-lg border-2 border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors">
              ปิด
            </button>
            <button onClick={save} className="flex-1 rounded-lg border-2 border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors">
              บันทึก
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ CONFIRM DIALOG ============
function ConfirmDialog({title,message,onConfirm,onCancel}){
  return(
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
        <h3 className="text-lg font-bold text-neutral-900 mb-2">{title}</h3>
        <p className="text-sm text-neutral-600 mb-6">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
            ยกเลิก
          </button>
          <button onClick={onConfirm} className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
            รีเซ็ต
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ MAIN APP ============
// ============ SUMMARY SCREEN ============
function SummaryScreen({
  customerName,customerPhone,salesName,carModel,mode,result,inputs,discount,
  selectedFreebies,freebieItems,freebieOther,
  redPlateDeposit,setRedPlateDeposit,regFee,setRegFee,depositPaid,setDepositPaid,
  onClose,showToast
}){
  const today=new Date().toLocaleDateString("th-TH",{year:"numeric",month:"long",day:"numeric"});
  const modeLabel=MODES[mode]?.label||mode;
  const modeSub=MODES[mode]?.sublabel||"";
  const fmt=n=>Number(n||0).toLocaleString("th-TH");

  // คำนวณค่าใช้จ่ายวันรับรถ
  const totalExpense=(result.downAmt||0)+(redPlateDeposit||0)+(regFee||0);
  const totalDeduct=(discount||0)+(depositPaid||0);
  const remaining=totalExpense-totalDeduct;

  // ของแถมที่เลือก
  const chosenFreebies=freebieItems.filter(f=>selectedFreebies.includes(f.id));

  // LINE Message
  const buildLine=()=>{
    const lines=[];
    lines.push(`📋 สรุปใบเสนอราคา BMW`);
    lines.push(`วันที่: ${today}`);
    lines.push(`━━━━━━━━━━━━━━━`);
    lines.push(`👤 ข้อมูลลูกค้า`);
    lines.push(`ชื่อ: ${customerName||"-"}`);
    lines.push(`เบอร์: ${customerPhone||"-"}`);
    lines.push(`Sales: ${salesName||"-"}`);
    lines.push(`━━━━━━━━━━━━━━━`);
    lines.push(`🚗 รายละเอียดรถ`);
    lines.push(`รุ่น: ${carModel||"-"}`);
    lines.push(`โหมด: ${modeLabel} ${modeSub}`);
    lines.push(`ราคา: ${fmt(result.carPrice)} บาท`);
    lines.push(`━━━━━━━━━━━━━━━`);
    lines.push(`💰 การผ่อนชำระ`);
    lines.push(`เงินดาวน์: ${fmt(result.downAmt)} บาท (${MODES[mode]?.hasDeposit ? inputs.depositPct||0 : inputs.downPct||0}%)`);
    lines.push(`ยอดจัด: ${fmt(result.finance)} บาท`);
    lines.push(`ค่างวด: ${fmt(result.monthly)} บาท/เดือน`);
    lines.push(`จำนวนงวด: ${inputs.term||0} เดือน`);
    if(chosenFreebies.length>0||freebieOther){
      lines.push(`━━━━━━━━━━━━━━━`);
      lines.push(`🎁 ของแถม`);
      chosenFreebies.forEach(f=>lines.push(`✓ ${f.name}${f.detail?` (${f.detail})`:""}`));
      if(freebieOther)lines.push(`✓ ${freebieOther}`);
    }
    lines.push(`━━━━━━━━━━━━━━━`);
    lines.push(`🧾 ค่าใช้จ่ายวันรับรถ`);
    lines.push(`เงินดาวน์: ${fmt(result.downAmt)} บาท`);
    lines.push(`ค่ามัดจำป้ายแดง: ${fmt(redPlateDeposit)} บาท`);
    if(regFee>0)lines.push(`ค่าจดทะเบียน: ${fmt(regFee)} บาท`);
    lines.push(`รวม: ${fmt(totalExpense)} บาท`);
    if(discount>0)lines.push(`หักส่วนลด: -${fmt(discount)} บาท`);
    if(depositPaid>0)lines.push(`หักเงินจอง: -${fmt(depositPaid)} บาท`);
    lines.push(`คงเหลือ: ${fmt(remaining)} บาท`);
    return lines.join("\n");
  };

  const copyLine=()=>{
    navigator.clipboard.writeText(buildLine())
      .then(()=>showToast("Copy LINE แล้ว ✓"))
      .catch(()=>showToast("Copy ไม่สำเร็จ"));
  };

  return(
    <div className="fixed inset-0 z-50 bg-neutral-100 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between bg-white px-4 py-3 shadow-sm">
        <button onClick={onClose} className="flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900">
          <ChevronRight size={18} className="rotate-180"/>
          <span>กลับ</span>
        </button>
        <h2 className="text-sm font-bold text-neutral-900">📋 สรุปใบเสนอราคา</h2>
        <div className="text-xs text-neutral-400">{today}</div>
      </div>

      <div className="mx-auto max-w-md space-y-3 p-4 pb-8">

        {/* ข้อมูลลูกค้า */}
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-[#1c69d4]">👤 ข้อมูลลูกค้า</div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-500">ชื่อลูกค้า</span>
              <span className="font-medium text-neutral-900">{customerName||"-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">เบอร์โทร</span>
              <span className="font-medium text-neutral-900">{customerPhone||"-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">พนักงานขาย</span>
              <span className="font-medium text-neutral-900">{salesName||"-"}</span>
            </div>
          </div>
        </div>

        {/* รายละเอียดรถและการผ่อน */}
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-[#1c69d4]">🚗 รายละเอียดรถและการผ่อน</div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-500">รุ่นรถ</span>
              <span className="font-medium text-neutral-900 text-right max-w-[60%]">{carModel||"-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">โหมด</span>
              <span className="font-medium text-neutral-900">{modeLabel} {modeSub}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">ราคารถ</span>
              <span className="font-medium tabular-nums">{fmt(result.carPrice)} บาท</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">เงินดาวน์</span>
              <span className="font-medium tabular-nums">{fmt(result.downAmt)} บาท ({MODES[mode]?.hasDeposit ? inputs.depositPct||0 : inputs.downPct||0}%)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">ยอดจัดไฟแนนซ์</span>
              <span className="font-medium tabular-nums">{fmt(result.finance)} บาท</span>
            </div>
            <div className="h-px bg-neutral-100 my-1"/>
            <div className="flex justify-between items-center">
              <span className="text-neutral-500">ค่างวด/เดือน</span>
              <span className="text-base font-bold text-[#1c69d4] tabular-nums">{fmt(result.monthly)} บาท</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">จำนวนงวด</span>
              <span className="font-medium">{inputs.term||0} เดือน</span>
            </div>
          </div>
        </div>

        {/* ของแถม */}
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-[#1c69d4]">🎁 ของแถมที่ได้รับ</div>
          {chosenFreebies.length===0&&!freebieOther?(
            <div className="text-sm text-neutral-400 text-center py-2">ไม่มีของแถม</div>
          ):(
            <div className="space-y-2">
              {chosenFreebies.map(f=>(
                <div key={f.id} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 text-green-500 flex-shrink-0">✓</span>
                  <div>
                    <div className="font-medium text-neutral-900">{f.name}</div>
                    {f.detail&&<div className="text-[11px] text-neutral-500">{f.detail}</div>}
                  </div>
                </div>
              ))}
              {freebieOther&&(
                <div className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 text-green-500 flex-shrink-0">✓</span>
                  <div className="font-medium text-neutral-900">{freebieOther}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ค่าใช้จ่ายวันรับรถ */}
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-[#1c69d4]">🧾 ค่าใช้จ่ายวันรับรถ</div>
          <div className="space-y-2.5">

            {/* เงินดาวน์ (อ่านอย่างเดียว) */}
            <div className="flex justify-between items-center text-sm">
              <span className="text-neutral-500">เงินดาวน์</span>
              <span className="font-medium tabular-nums">{fmt(result.downAmt)} บาท</span>
            </div>

            {/* ค่ามัดจำป้ายแดง */}
            <div className="flex justify-between items-center gap-3 text-sm">
              <span className="text-neutral-500 flex-shrink-0">ค่ามัดจำป้ายแดง</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={redPlateDeposit}
                  onChange={e=>setRedPlateDeposit(Number(e.target.value))}
                  className="w-28 rounded-lg border border-neutral-200 px-2 py-1 text-right text-sm font-medium outline-none focus:border-[#1c69d4] tabular-nums"
                />
                <span className="text-neutral-500 text-xs">บาท</span>
              </div>
            </div>

            {/* ค่าจดทะเบียน */}
            <div className="flex justify-between items-center gap-3 text-sm">
              <span className="text-neutral-500 flex-shrink-0">ค่าจดทะเบียน</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={regFee}
                  onChange={e=>setRegFee(Number(e.target.value))}
                  className="w-28 rounded-lg border border-neutral-200 px-2 py-1 text-right text-sm font-medium outline-none focus:border-[#1c69d4] tabular-nums"
                  placeholder="0"
                />
                <span className="text-neutral-500 text-xs">บาท</span>
              </div>
            </div>

            {/* เส้นคั่น */}
            <div className="h-px bg-neutral-100"/>

            {/* รวม */}
            <div className="flex justify-between items-center text-sm font-semibold">
              <span>รวม</span>
              <span className="tabular-nums">{fmt(totalExpense)} บาท</span>
            </div>

            {/* หักส่วนลด (แสดงถ้ามี) */}
            {discount>0&&(
              <div className="flex justify-between items-center text-sm text-red-500">
                <span>หักส่วนลด</span>
                <span className="tabular-nums">-{fmt(discount)} บาท</span>
              </div>
            )}

            {/* หักเงินจอง */}
            <div className="flex justify-between items-center gap-3 text-sm">
              <span className="text-neutral-500 flex-shrink-0">หักเงินจอง</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={depositPaid}
                  onChange={e=>setDepositPaid(Number(e.target.value))}
                  className="w-28 rounded-lg border border-neutral-200 px-2 py-1 text-right text-sm font-medium outline-none focus:border-[#1c69d4] tabular-nums"
                  placeholder="0"
                />
                <span className="text-neutral-500 text-xs">บาท</span>
              </div>
            </div>

            {/* เส้นคั่นคงเหลือ */}
            <div className="h-px bg-neutral-200"/>

            {/* คงเหลือ */}
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-neutral-900">คงเหลือชำระวันรับรถ</span>
              <span className={`text-base font-bold tabular-nums ${remaining<0?"text-red-500":"text-[#1c69d4]"}`}>
                {fmt(remaining)} บาท
              </span>
            </div>

          </div>
        </div>

        {/* ปุ่ม Copy LINE */}
        <button
          onClick={copyLine}
          className="w-full rounded-xl bg-[#06c755] py-3.5 text-sm font-bold text-white shadow-sm active:bg-[#05a847] flex items-center justify-center gap-2"
        >
          <MessageSquare size={18}/>
          Copy LINE Message
        </button>

      </div>
    </div>
  );
}


function DownTableScreen({carModel,mode,inputs,discount,onClose}){
  const DOWN_PCTS=[20,25,30,35];
  const [selectedTerm,setSelectedTerm]=useState(Number(inputs.term)||60);
  const TERMS=[48,60,72];
  const modeInfo=MODES[mode];
  const key=modeInfo.hasDeposit?'depositPct':'downPct';
  const data=DOWN_PCTS.map(pct=>{
    const newInputs={...inputs,[key]:pct,term:selectedTerm};
    const r=calculate(mode,newInputs,discount||0);
    return{pct,downAmt:modeInfo.hasDeposit?r.depositAmt:r.downAmt,monthly:r.monthly};
  });
  return(
    <div className="fixed inset-0 z-50 bg-neutral-50 overflow-y-auto">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 backdrop-blur px-4 py-3 flex items-center gap-3">
        <button onClick={onClose} className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 text-lg">←</button>
        <div>
          <div className="text-sm font-bold text-neutral-900">ตารางเปรียบเทียบยอดผ่อน</div>
          <div className="text-xs text-neutral-500">{carModel||'ยังไม่เลือกรถ'}</div>
        </div>
      </header>
      <main className="mx-auto max-w-md p-4 space-y-4">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#1c69d4] px-3 py-1 text-xs font-bold text-white">{mode}</span>
          <span className="text-xs text-neutral-500">{modeInfo.thaiName}</span>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-3">
          <p className="mb-2 text-xs font-semibold text-neutral-500">ระยะเวลาผ่อน</p>
          <div className="flex gap-2">
            {TERMS.map(t=>(
              <button key={t} onClick={()=>setSelectedTerm(t)}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${selectedTerm===t?'bg-[#1c69d4] text-white':'border border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}>
                {t} เดือน
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-500">ดาวน์</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-neutral-500">เงินดาวน์ (บาท)</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-neutral-500">ยอดผ่อน/เดือน</th>
              </tr>
            </thead>
            <tbody>
              {data.map(({pct,downAmt,monthly},idx)=>(
                <tr key={pct} className={idx%2===0?'bg-white':'bg-neutral-50'}>
                  <td className="px-4 py-3 font-semibold text-neutral-700">{pct}%</td>
                  <td className="px-4 py-3 text-right text-neutral-600 tabular-nums">{fmtB(downAmt)}</td>
                  <td className="px-4 py-3 text-right font-bold text-[#1c69d4] tabular-nums">{fmtB(monthly)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-center text-xs text-neutral-400 pb-4">
          คำนวณจากระยะเวลา {selectedTerm} เดือน | อัตราดอกเบี้ยตามโปรโมชั่นปัจจุบัน
        </p>
      </main>
    </div>
  );
}

export default function App(){
  const[carDB,setCarDB]=useState([]);
  const[mode,setMode]=useState("HP");
  const[inputs,setInputs]=useState(DEFAULT_INPUTS.HP);
  const[carModel,setCarModel]=useState("");
  const[selectedCar,setSelectedCar]=useState(null);
  const[selectedBSI,setSelectedBSI]=useState(null);
  const[customerName,setCustomerName]=useState("");
  const[customerPhone,setCustomerPhone]=useState("");
  const[salesName,setSalesName]=useState("");
  const[discount,setDiscount]=useState(0);
  const[showAdvanced,setShowAdvanced]=useState(false);
  const[showSalesDetail,setShowSalesDetail]=useState(false);
  const[showSaved,setShowSaved]=useState(false);
  const[showCarManager,setShowCarManager]=useState(false);
  const[showSettings,setShowSettings]=useState(false);
  const[showPromoManager,setShowPromoManager]=useState(false);
  const[showResetConfirm,setShowResetConfirm]=useState(false);
  const[savedList,setSavedList]=useState([]);
  const[toast,setToast]=useState("");
  
  // Promotion State
  const[currentPromoId,setCurrentPromoId]=useState("");
  const[promotions,setPromotions]=useState({});
  const[autoFilledRate,setAutoFilledRate]=useState(null);
  
  // Freebies State
  const[freebieItems,setFreebieItems]=useState([]);
  const[selectedFreebies,setSelectedFreebies]=useState([]);
  const[freebieOther,setFreebieOther]=useState("");
  const[showFreebieManager,setShowFreebieManager]=useState(false);

  // Summary Screen State
  const[showSummary,setShowSummary]=useState(false);
  const[showDownTable,setShowDownTable]=useState(false);
  const[redPlateDeposit,setRedPlateDeposit]=useState(10000);
  const[regFee,setRegFee]=useState(0);
  const[depositPaid,setDepositPaid]=useState(0);
  
  // Load + Firebase Realtime Sync
  useEffect(()=>{
    // โหลด salesName จาก localStorage ก่อน (ไม่ sync ข้ามเครื่อง)
    const savedSales=localStorage.getItem("salesName");
    if(savedSales) setSalesName(savedSales);
    loadSavedList();

    // ฟัง Firebase realtime - sync carDB, promotions, freebies ข้ามเครื่อง
    const unsub = onSnapshot(SHARED_DOC, (snap) => {
      try {
        if(snap.exists()){
          const data = snap.data();

          // carDB
          if(data.carDB && Array.isArray(data.carDB) && data.carDB.length > 0){
            setCarDB(data.carDB);
            localStorage.setItem("carDB", JSON.stringify(data.carDB));
          } else {
            setCarDB(DEFAULT_CAR_DB);
          }

          // promotions
          if(data.promotions && data.promotions.promotions){
            setPromotions(data.promotions.promotions);
            setCurrentPromoId(data.promotions.currentPromo||"");
            localStorage.setItem("promotions", JSON.stringify(data.promotions));
          } else {
            initializeDefaultPromotion();
          }

          // freebies
          if(data.freebieItems && Array.isArray(data.freebieItems) && data.freebieItems.length > 0){
            setFreebieItems(data.freebieItems);
            localStorage.setItem("freebieItems", JSON.stringify(data.freebieItems));
          } else {
            setFreebieItems(DEFAULT_FREEBIES);
          }

        } else {
          // Firebase ว่าง → ใช้ข้อมูล local หรือ default แล้ว upload ขึ้น
          const localCarDB = JSON.parse(localStorage.getItem("carDB")||"null");
          const localPromos = JSON.parse(localStorage.getItem("promotions")||"null");
          const localFreebies = JSON.parse(localStorage.getItem("freebieItems")||"null");

          const carDBToUse = (localCarDB && localCarDB.length > 0) ? localCarDB : DEFAULT_CAR_DB;
          const freebiestoUse = (localFreebies && localFreebies.length > 0) ? localFreebies : DEFAULT_FREEBIES;

          setCarDB(carDBToUse);
          setFreebieItems(freebiestoUse);

          if(localPromos && localPromos.promotions){
            setPromotions(localPromos.promotions);
            setCurrentPromoId(localPromos.currentPromo||"");
          } else {
            initializeDefaultPromotion();
          }

          // Upload ข้อมูล local ขึ้น Firebase
          saveToCloud("carDB", carDBToUse);
          saveToCloud("freebieItems", freebiestoUse);
          if(localPromos) saveToCloud("promotions", localPromos);
        }
      } catch(err){
        console.error("Firebase sync error:", err);
        // Fallback to localStorage
        try {
          const saved=localStorage.getItem("carDB");
          if(saved){ const p=JSON.parse(saved); if(p?.length>0) setCarDB(p); else setCarDB(DEFAULT_CAR_DB); }
          else setCarDB(DEFAULT_CAR_DB);
          const savedPromos=localStorage.getItem("promotions");
          if(savedPromos){ const p=JSON.parse(savedPromos); if(p?.promotions){ setPromotions(p.promotions); setCurrentPromoId(p.currentPromo||""); } else initializeDefaultPromotion(); }
          else initializeDefaultPromotion();
          const savedFreebies=localStorage.getItem("freebieItems");
          if(savedFreebies){ const p=JSON.parse(savedFreebies); if(p?.length>0) setFreebieItems(p); else setFreebieItems(DEFAULT_FREEBIES); }
          else setFreebieItems(DEFAULT_FREEBIES);
        } catch { setCarDB(DEFAULT_CAR_DB); setFreebieItems(DEFAULT_FREEBIES); initializeDefaultPromotion(); }
      }
    }, (err) => {
      console.warn("Firebase offline, using local data:", err);
      // Offline fallback
      try {
        const saved=localStorage.getItem("carDB");
        if(saved){ const p=JSON.parse(saved); if(p?.length>0) setCarDB(p); else setCarDB(DEFAULT_CAR_DB); } else setCarDB(DEFAULT_CAR_DB);
        const savedPromos=localStorage.getItem("promotions");
        if(savedPromos){ const p=JSON.parse(savedPromos); if(p?.promotions){ setPromotions(p.promotions); setCurrentPromoId(p.currentPromo||""); } else initializeDefaultPromotion(); } else initializeDefaultPromotion();
        const savedFreebies=localStorage.getItem("freebieItems");
        if(savedFreebies){ const p=JSON.parse(savedFreebies); if(p?.length>0) setFreebieItems(p); else setFreebieItems(DEFAULT_FREEBIES); } else setFreebieItems(DEFAULT_FREEBIES);
      } catch { setCarDB(DEFAULT_CAR_DB); setFreebieItems(DEFAULT_FREEBIES); initializeDefaultPromotion(); }
    });

    return () => unsub(); // cleanup listener
  },[]);
  
  const initializeDefaultPromotion=()=>{
    const now=new Date();
    const promoId=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const monthName=now.toLocaleDateString('th-TH',{year:'numeric',month:'short'});
    
    const newPromo={...DEFAULT_PROMOTION,month:monthName,importedAt:Date.now()};
    const newPromos={[promoId]:newPromo};
    
    setPromotions(newPromos);
    setCurrentPromoId(promoId);
    
    try{
      localStorage.setItem("promotions",JSON.stringify({
        currentPromo:promoId,
        promotions:newPromos
      }));
    }catch(err){
      console.error("Failed to save promotion:",err);
    }
  };
  
  const saveCarDB=cars=>{
    try{
      localStorage.setItem("carDB",JSON.stringify(cars));
      setCarDB(cars);
      saveToCloud("carDB", cars);
      showToast("บันทึกรถแล้ว ✓");
    }
    catch{ showToast("บันทึกไม่สำเร็จ"); }
  };
  
  const saveSalesName=name=>{
    try{ localStorage.setItem("salesName",name); setSalesName(name); showToast("บันทึกชื่อแล้ว ✓"); }
    catch{ showToast("บันทึกไม่สำเร็จ"); }
  };
  
  const savePromotions=data=>{
    try{
      const json=JSON.stringify(data);
      if(json.length>1000000){
        alert("⚠️ ข้อมูลโปรโมชั่นใหญ่เกินไป\nแนะนำให้ลบโปรโมชั่นเก่าที่ไม่ใช้แล้ว");
        return;
      }
      localStorage.setItem("promotions",json);
      setPromotions(data.promotions);
      setCurrentPromoId(data.currentPromo);
      saveToCloud("promotions", data);
      showToast("บันทึกโปรโมชั่นแล้ว ✓");
    }catch(err){
      console.error("Save promotion error:",err);
      if(err.name==="QuotaExceededError"){
        alert("❌ พื้นที่เก็บข้อมูลเต็ม\nกรุณาลบโปรโมชั่นเก่าหรือข้อมูลที่ไม่ใช้แล้ว");
      }else{
        alert("❌ บันทึกไม่สำเร็จ\nกรุณาลองใหม่อีกครั้ง");
      }
    }
  };
  
  // Export ข้อมูลทั้งหมด (Backup)
  const exportAllData=()=>{
    try{
      const data={
        version:APP_VERSION,
        exportedAt:new Date().toISOString(),
        carDB,
        promotions:{currentPromo:currentPromoId,promotions},
        salesName,
        freebieItems
      };
      
      const json=JSON.stringify(data,null,2);
      const blob=new Blob([json],{type:"application/json"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url;
      a.download=`bmw-quotation-backup-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      showToast("ส่งออกข้อมูลสำเร็จ ✓");
    }catch(err){
      console.error("Export error:",err);
      alert("❌ ส่งออกข้อมูลไม่สำเร็จ");
    }
  };
  
  // Import ข้อมูลทั้งหมด (Restore)
  const importAllData=e=>{
    const file=e.target.files?.[0];
    if(!file)return;
    
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const data=JSON.parse(ev.target.result);
        
        // Validate
        if(!data.carDB||!data.promotions||!data.version){
          alert("❌ ไฟล์ไม่ถูกต้อง\nกรุณาเลือกไฟล์ backup ที่ส่งออกจากแอปนี้");
          return;
        }
        
        if(!confirm("⚠️ การนำเข้าจะเขียนทับข้อมูลเดิมทั้งหมด\n\nต้องการดำเนินการต่อ?")){
          return;
        }
        
        // Restore
        setCarDB(data.carDB);
        setPromotions(data.promotions.promotions);
        setCurrentPromoId(data.promotions.currentPromo);
        setSalesName(data.salesName||"");
        setFreebieItems(data.freebieItems||DEFAULT_FREEBIES);
        
        localStorage.setItem("carDB",JSON.stringify(data.carDB));
        localStorage.setItem("promotions",JSON.stringify(data.promotions));
        localStorage.setItem("salesName",data.salesName||"");
        localStorage.setItem("freebieItems",JSON.stringify(data.freebieItems||DEFAULT_FREEBIES));
        
        showToast("นำเข้าข้อมูลสำเร็จ ✓");
      }catch(err){
        console.error("Import error:",err);
        alert("❌ นำเข้าข้อมูลไม่สำเร็จ\nไฟล์อาจเสียหายหรือไม่ถูกต้อง");
      }
    };
    reader.readAsText(file);
    e.target.value=""; // Reset input
  };
  
  // Save Freebies
  const saveFreebies=items=>{
    try{
      localStorage.setItem("freebieItems",JSON.stringify(items));
      setFreebieItems(items);
      saveToCloud("freebieItems", items);
      showToast("บันทึกของแถมแล้ว ✓");
    }catch(err){
      console.error("Save freebies error:",err);
      alert("❌ บันทึกไม่สำเร็จ");
    }
  };
  
  const setField=(k,v)=>{
    setInputs(prev=>({...prev,[k]:v}));
    if((k==='downPct'||k==='depositPct'||k==='term') && currentPromoId && carModel){
      const downPct=k==='downPct'||k==='depositPct'
        ? Number(v)
        : (Number(inputs.downPct)||Number(inputs.depositPct)||0);
      const term=k==='term' ? Number(v) : (Number(inputs.term)||60);
      autoFillRate(mode,carModel,downPct,term);
    }
  };

  const autoFillRate=(currentMode,currentCarModel,downPct,term)=>{
    if(!currentPromoId || !promotions[currentPromoId])return;
    const rateInfo=getRateForPromotion(currentMode,currentCarModel,downPct,term,promotions[currentPromoId]);
    if(rateInfo){
      setAutoFilledRate(rateInfo);
      if(currentMode==="HP"){
        setInputs(prev=>({...prev,sfFlatRate:rateInfo.rate}));
      }else{
        setInputs(prev=>({...prev,sfEffRate:rateInfo.rate}));
      }
    }
  };
  const result=useMemo(()=>calculate(mode,inputs,discount),[mode,inputs,discount]);
  const m=MODES[mode];
  
  const switchMode=newMode=>{
    setMode(newMode);
    setInputs(prev=>({
      ...DEFAULT_INPUTS[newMode],
      carPrice:prev.carPrice||DEFAULT_INPUTS[newMode].carPrice,
      bsi:prev.bsi||0,
      accessory:prev.accessory||0,
      ...(selectedCar&&MODES[newMode].hasGFV?{gfv:selectedCar.gfv}:{}),
    }));
  };
  
  const handleCarSelect=car=>{
    setSelectedCar(car); setCarModel(car.model); setSelectedBSI(car.bsiStd);
    setInputs(prev=>{
      const newInputs={...prev,carPrice:car.bsiStd,...(MODES[mode].hasGFV&&car.gfv?{gfv:car.gfv}:{})};
      
      // Auto-fill rate
      const downPct=MODES[mode].hasDeposit ? (Number(prev.depositPct) || 25) : (Number(prev.downPct) || 25);
      setTimeout(()=>autoFillRate(mode,car.model,downPct,Number(inputs.term)||60),0);
      
      return newInputs;
    });
  };
  
  const handleBSISelect=price=>{ setSelectedBSI(price); setField("carPrice",price); };
  
  const handleReset=()=>{
    setMode("HP");
    setInputs({...DEFAULT_INPUTS.HP, carPrice: 0}); // ✅ เซ็ตราคาเป็น 0
    setCarModel("");
    setSelectedCar(null);
    setSelectedBSI(null);
    setCustomerName("");
    setCustomerPhone("");
    setDiscount(0);
    setShowAdvanced(false);
    setShowSalesDetail(false);
    setShowResetConfirm(false);
    setAutoFilledRate(null); // ✅ เคลียร์ auto-fill badge
    showToast("รีเซ็ตข้อมูลแล้ว ✓");
  };
  
  const toastRef=useRef(null);
  const showToast=msg=>{ if(toastRef.current)clearTimeout(toastRef.current); setToast(msg); toastRef.current=setTimeout(()=>setToast(""),2500); };
  
  const loadSavedList=()=>{
    try{
      const list=[];
      for(let i=0;i<localStorage.length;i++){
        const key=localStorage.key(i);
        if(key?.startsWith("quote:")){
          try{list.push({key,data:JSON.parse(localStorage.getItem(key))});}catch{}
        }
      }
      setSavedList(list.sort((a,b)=>b.data.savedAt-a.data.savedAt));
    }catch{}
  };
  
  const saveQuote=()=>{
    const id=Date.now(), key=`quote:${id}`;
    try{
      localStorage.setItem(key,JSON.stringify({id,mode,inputs,carModel,customerName,customerPhone,salesName,discount,savedAt:id,monthly:result.monthly,finance:result.finance}));
      showToast("บันทึกเรียบร้อย ✓"); loadSavedList();
    }catch{showToast("บันทึกไม่สำเร็จ");}
  };
  
  const loadQuote=q=>{
    setMode(q.mode); setInputs(q.inputs);
    setCarModel(q.carModel||""); setCustomerName(q.customerName||"");
    setCustomerPhone(q.customerPhone||""); 
    setDiscount(q.discount||0);
    setShowSaved(false); showToast("โหลดข้อมูลแล้ว ✓");
  };
  
  const deleteQuote=key=>{
    if(!confirm("ต้องการลบ Quote นี้ใช่ไหม?"))return;
    try{localStorage.removeItem(key); loadSavedList(); showToast("ลบแล้ว");}catch{}
  };
  
  const validityDate=new Date();
  validityDate.setDate(validityDate.getDate()+3);
  const validityStr=validityDate.toLocaleDateString("th-TH",{year:"numeric",month:"short",day:"numeric"});

  const copyTextQuote=()=>{
    const actualPrice=result.carPrice + (Number(discount)||0);
    
    // สร้างรายการของแถม
    let freebieText = "";
    const selectedItems = selectedFreebies
      .map(id => freebieItems.find(f => f.id === id))
      .filter(Boolean);
    
    if (selectedItems.length > 0 || freebieOther) {
      freebieText = "\n━━━━━━━━━━━━━━━\n🎁 ของแถม\n";
      selectedItems.forEach(item => {
        freebieText += `• ${item.name}`;
        if (item.detail) freebieText += ` (${item.detail})`;
        freebieText += "\n";
      });
      if (freebieOther) {
        freebieText += `• ${freebieOther}\n`;
      }
    }
    
    const txt=`🚗 BMW QUOTATION
━━━━━━━━━━━━━━━

ลูกค้า: ${customerName||"-"}
เบอร์: ${customerPhone||"-"}
รุ่น: ${carModel||"-"}

━━━━━━━━━━━━━━━
💰 ราคารถ: ${fmtB(actualPrice)} บาท
${discount>0?`🎁 ส่วนลด: ${fmtB(discount)} บาท\n   ราคาสุทธิ: ${fmtB(result.carPrice)} บาท\n`:``}
📋 ${m.fullName}
• ยอดจัดไฟแนนซ์: ${fmtB(result.finance)} บาท
${m.hasBalloon?`• Balloon: ${fmtB(result.balloonAmt)} (${fmtP(result.balloonPct)})\n`:""}${m.hasGFV?`• GFV: ${fmtB(result.gfv)}\n`:""}• เงินดาวน์: ${fmtB(m.hasDeposit?result.depositAmt:result.downAmt)} (${fmtP(m.hasDeposit?result.depositPct:result.downPct)})
• ดอกเบี้ย: ${fmtP(result.custRate)}

✅ ค่างวด: ${fmtB(result.monthly)} บาท/เดือน
   ระยะเวลา: ${result.term} งวด${freebieText}
━━━━━━━━━━━━━━━
👨‍💼 Sales: ${salesName||"-"}
📅 ใช้ได้ถึง: ${validityStr}`;
    navigator.clipboard.writeText(txt).then(()=>showToast("คัดลอกข้อความแล้ว ✓")).catch(()=>showToast("คัดลอกไม่ได้"));
  };
  
  return(
    <div className="min-h-screen bg-neutral-50" style={{fontFamily:"'Inter',-apple-system,sans-serif"}}>
      {/* HEADER */}
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <img src="/logo-big.png" alt="BMW Logo" className="h-8 w-8 object-contain" />
            <div>
              <div className="text-[14px] font-bold leading-tight text-neutral-900">Quotation</div>
              <div className="text-[10px] text-neutral-500 leading-tight">v{APP_VERSION}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={()=>setShowSettings(true)} className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100" title="ตั้งค่า">
              <Settings size={18}/>
            </button>
            <button onClick={copyTextQuote} className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100" title="Copy ข้อความ">
              <MessageSquare size={18}/>
            </button>
            <button onClick={()=>setShowSaved(true)} className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100" title="โหลด">
              <FolderOpen size={18}/>
            </button>
            <button onClick={saveQuote} className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100" title="บันทึก">
              <Save size={18}/>
            </button>
            <button onClick={()=>setShowResetConfirm(true)} className="rounded-lg bg-red-600 p-2 text-white hover:bg-red-700" title="Reset">
              <RotateCcw size={18}/>
            </button>
          </div>
        </div>
        <div className="mx-auto max-w-md px-3 pb-3">
          <div className="grid grid-cols-5 gap-1.5">
            {Object.keys(MODES).map(k=><ModeButton key={k} modeKey={k} active={mode===k} onClick={()=>switchMode(k)}/>)}
          </div>
        </div>
      </header>
      
      {/* MAIN */}
      <main className="mx-auto max-w-md px-4 pb-32 pt-4 space-y-4">
        
        {/* Customer Info */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
            <div className="h-1 w-1 rounded-full bg-[#1c69d4]"/>ข้อมูลลูกค้า
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="text" value={customerName} onChange={e=>setCustomerName(e.target.value)}
              placeholder="ชื่อลูกค้า" className="rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[#1c69d4]"/>
            <input type="tel" value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)}
              placeholder="เบอร์โทร" className="rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[#1c69d4]"/>
          </div>
          <CarSelector value={carModel} onSelect={handleCarSelect} carDB={carDB}/>
          {selectedCar&&(
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">เลือกแพคเกจ BSI</div>
              <BSISelector car={selectedCar} selected={selectedBSI} onSelect={handleBSISelect}/>
            </div>
          )}
        </div>
        
        {/* Hero */}
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 p-5 text-white shadow-xl">
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[#1c69d4]/20 blur-3xl"/>
          <div className="absolute -left-8 -bottom-8 h-32 w-32 rounded-full bg-[#e22718]/10 blur-3xl"/>
          <div className="relative">
            {!selectedCar ? (
              <div className="text-center py-8">
                <div className="text-neutral-400 text-sm mb-2">กรุณาเลือกรุ่นรถก่อน</div>
                <div className="text-6xl font-bold tabular-nums tracking-tight">0</div>
                <div className="text-sm font-medium text-neutral-300 mt-2">บาท/เดือน</div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-neutral-400">{m.fullName}</span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-neutral-300">{result.term} เดือน</span>
                </div>
                <div className="text-[10px] text-neutral-400 mb-3">ค่างวดต่อเดือน</div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-bold tabular-nums tracking-tight">{fmtB(result.monthly)}</span>
                  <span className="text-sm font-medium text-neutral-300">บาท/เดือน</span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/10 pt-3">
                  <div><div className="text-[10px] text-neutral-400">ราคารถ</div><div className="text-sm font-semibold tabular-nums">{fmtB(result.carPrice + (Number(discount)||0))}</div></div>
                  <div><div className="text-[10px] text-neutral-400">ยอดจัด</div><div className="text-sm font-semibold tabular-nums">{fmtB(result.finance)}</div></div>
                  <div><div className="text-[10px] text-neutral-400">ดาวน์</div><div className="text-sm font-semibold tabular-nums">{fmtB(m.hasDeposit?result.depositAmt:result.downAmt)}</div></div>
                </div>
              </>
            )}
          </div>
        </div>
        
        {/* Inputs */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-4">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
            <div className="h-1 w-1 rounded-full bg-[#1c69d4]"/>ข้อมูลคำนวณ
          </div>
          <NumberInput label="ราคารถ" value={inputs.carPrice} onChange={v=>setField("carPrice",v)} suffix="บาท" accent/>
          <div className="grid grid-cols-2 gap-3">
            {m.hasDeposit?(
              <>
                <NumberInput label="Deposit" value={inputs.depositPct} onChange={v=>setField("depositPct",v)} suffix="%"/>
                <div className="space-y-1.5"><label className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Deposit Amt.</label>
                  <div className="rounded-lg bg-neutral-100 px-3 py-2.5 text-[15px] font-semibold tabular-nums text-neutral-700 flex items-center min-h-[46px]">{fmtB(result.depositAmt)}</div></div>
              </>
            ):(
              <>
                <NumberInput label="Down Payment" value={inputs.downPct} onChange={v=>setField("downPct",v)} suffix="%"/>
                <div className="space-y-1.5"><label className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Down Amt.</label>
                  <div className="rounded-lg bg-neutral-100 px-3 py-2.5 text-[15px] font-semibold tabular-nums text-neutral-700 flex items-center min-h-[46px]">{fmtB(result.downAmt)}</div></div>
              </>
            )}
          </div>
          {m.hasBalloon&&(
            <div className="grid grid-cols-2 gap-3">
              <NumberInput label="Balloon" value={inputs.balloonPct} onChange={v=>setField("balloonPct",v)} suffix="%"/>
              <div className="space-y-1.5"><label className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Balloon Amt.</label>
                <div className="rounded-lg bg-neutral-100 px-3 py-2.5 text-[15px] font-semibold tabular-nums text-neutral-700 flex items-center min-h-[46px]">{fmtB(result.balloonAmt)}</div></div>
            </div>
          )}
          {m.hasGFV&&(
            <div className="rounded-lg border border-[#1c69d4]/30 bg-[#1c69d4]/[0.04] p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <Info size={12} className="text-[#1c69d4]"/>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#1c69d4]">GFV · Guaranteed Future Value</span>
              </div>
              <div className="text-[10px] text-neutral-600">มูลค่ารับซื้อคืนการันตี · ใช้คำนวณค่างวด</div>
              <NumberInput label="GFV" value={inputs.gfv} onChange={v=>setField("gfv",v)} suffix="บาท" hint={`= ${fmtP(result.gfvPct)}`}/>
            </div>
          )}
          {m.hasRV&&(
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-neutral-50 p-3">
              <div><div className="text-[10px] uppercase tracking-wider text-neutral-500">RV %</div><div className="text-sm font-semibold tabular-nums">{fmtP(result.rvPct)}</div></div>
              <div><div className="text-[10px] uppercase tracking-wider text-neutral-500">RV Amount</div><div className="text-sm font-semibold tabular-nums">{fmtB(result.rvAmt)}</div></div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Term</label>
              <select value={inputs.term} onChange={e=>setField("term",e.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-[15px] font-medium outline-none focus:border-[#1c69d4]">
                {[12,24,36,48,60,72,84].map(t=><option key={t} value={t}>{t} เดือน</option>)}
              </select>
            </div>
            <NumberInput label="ส่วนลด" value={discount} onChange={v=>setDiscount(Number(v)||0)} suffix="บาท"/>
          </div>
          <button onClick={()=>setShowAdvanced(!showAdvanced)}
            className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100">
            <span className="flex items-center gap-1.5"><Settings size={14}/>ตัวเลือกเพิ่มเติม</span>
            <ChevronRight size={14} className={`transition-transform ${showAdvanced?"rotate-90":""}`}/>
          </button>
          {showAdvanced&&(
            <div className="space-y-3 rounded-lg bg-neutral-50 p-3">
              <div className="grid grid-cols-2 gap-3">
                <NumberInput label="Accessory" value={inputs.accessory} onChange={v=>setField("accessory",v)} suffix="บาท"/>
                <NumberInput label="BSI" value={inputs.bsi} onChange={v=>setField("bsi",v)} suffix="บาท"/>
              </div>
              
              <div>
                <NumberInput label={`SF ${m.rateLabel}`}
                  value={mode==="HP"?inputs.sfFlatRate:inputs.sfEffRate}
                  onChange={v=>setField(mode==="HP"?"sfFlatRate":"sfEffRate",v)} 
                  suffix="%"
                  accent={autoFilledRate!==null}/>
                
                {autoFilledRate&&(
                  <div className={`mt-2 flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                    autoFilledRate.type==='special'
                    ?'bg-amber-50 text-amber-900 border border-amber-200'
                    :'bg-blue-50 text-blue-900 border border-blue-200'
                  }`}>
                    <span className="font-medium">
                      {autoFilledRate.type==='special'?'✨ อัตราพิเศษ':'💡 อัตรามาตรฐาน'}
                    </span>
                    <span>·</span>
                    <span>{autoFilledRate.source}</span>
                  </div>
                )}
              </div>
              
              <div>
                <NumberInput label="Add. Interest" value={inputs.addInterest} onChange={v=>setField("addInterest",v)} suffix="%" hint="ดอกเบี้ยเพิ่ม"/>
                {inputs.addInterest>0&&(
                  <div className="mt-2 text-xs text-neutral-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    💰 งบ Rebate: <span className="font-semibold text-green-700">{fmtB(result.rebateAmount||0)}</span> บาท
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* FREEBIES SECTION */}
          <div className="rounded-lg border border-neutral-200 bg-white p-3">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-semibold text-neutral-700">🎁 ของแถม</div>
              {freebieItems.length===0&&(
                <button onClick={()=>setShowFreebieManager(true)} className="text-[10px] text-blue-600 hover:underline">
                  ตั้งค่า
                </button>
              )}
            </div>
            
            {(() => {
              const rebateBudget = result.rebateAmount || 0;
              const selectedCost = selectedFreebies.reduce((sum, id) => {
                const item = freebieItems.find(f => f.id === id);
                return sum + (item?.cost || 0);
              }, 0);
              const remaining = rebateBudget - selectedCost;
              const isOverBudget = selectedCost > rebateBudget && rebateBudget > 0;
              
              return (
                <>
                  {rebateBudget > 0 && (
                    <div className={`mb-3 p-2 rounded-lg text-xs ${
                      isOverBudget 
                      ? 'bg-red-50 border border-red-200' 
                      : 'bg-neutral-50 border border-neutral-200'
                    }`}>
                      <div className="flex justify-between mb-1">
                        <span className="text-neutral-600">งบที่มี:</span>
                        <span className="font-medium">{fmtB(rebateBudget)} บาท</span>
                      </div>
                      <div className="flex justify-between mb-1">
                        <span className="text-neutral-600">ใช้แล้ว:</span>
                        <span className="font-medium">{fmtB(selectedCost)} บาท</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-neutral-200">
                        <span className="text-neutral-700 font-medium">คงเหลือ:</span>
                        <span className={`font-bold ${isOverBudget ? 'text-red-600' : 'text-green-600'}`}>
                          {fmtB(remaining)} บาท {isOverBudget && '❌'}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {freebieItems.length > 0 ? (
                    <div className="space-y-2">
                      {freebieItems.map(item => (
                        <label key={item.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-neutral-50 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={selectedFreebies.includes(item.id)}
                            onChange={e => {
                              if (e.target.checked) {
                                setSelectedFreebies([...selectedFreebies, item.id]);
                              } else {
                                setSelectedFreebies(selectedFreebies.filter(id => id !== item.id));
                              }
                            }}
                            className="mt-0.5"
                          />
                          <div className="flex-1">
                            <div className="text-xs font-medium text-neutral-900">{item.name}</div>
                            {item.detail && <div className="text-[10px] text-neutral-500">{item.detail}</div>}
                            <div className="text-[10px] text-neutral-600 mt-0.5">{item.cost.toLocaleString()} บาท</div>
                          </div>
                        </label>
                      ))}
                      
                      <div className="pt-2 border-t border-neutral-200">
                        <label className="text-[10px] text-neutral-600 block mb-1">อื่นๆ</label>
                        <input 
                          type="text" 
                          value={freebieOther}
                          onChange={e => setFreebieOther(e.target.value)}
                          placeholder="ระบุของแถมอื่นๆ"
                          className="w-full text-xs px-2 py-1.5 border border-neutral-200 rounded"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4 text-xs text-neutral-500">
                      <div className="mb-2">ยังไม่มีรายการของแถม</div>
                      <button 
                        onClick={() => setShowFreebieManager(true)}
                        className="text-blue-600 hover:underline"
                      >
                        ตั้งค่ารายการของแถม
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
        
        {/* Sales Detail (ซ่อนไว้) */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <button onClick={()=>setShowSalesDetail(!showSalesDetail)}
            className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
              <div className="h-1 w-1 rounded-full bg-[#1c69d4]"/>รายละเอียด Sales
            </div>
            <ChevronRight size={14} className={`transition-transform text-neutral-400 ${showSalesDetail?"rotate-90":""}`}/>
          </button>
          {showSalesDetail&&(
            <div className="divide-y divide-neutral-100 mt-3">
              <StatRow label="Finance Amount" value={fmtB2(result.finance)}/>
              <StatRow label="Monthly Payment" value={fmtB2(result.monthly)} accent/>
              {mode==="HP"?<>
                <StatRow label="Customer Flat Rate" value={fmtP(result.custRate)}/>
                <StatRow label="SF Flat Rate" value={fmtP(result.sfRate)}/>
                <StatRow label="Real SF Flat" value={fmtP(result.realSfRate)}/>
                <StatRow label="SF Installment" value={fmtB2(result.sfInstallment)}/>
                <StatRow label="SF Eff. Rate" value={fmtP(result.sfEffRate)}/>
              </>:<>
                <StatRow label="Customer Eff. Rate" value={fmtP(result.custRate)}/>
                <StatRow label="SF Eff. Rate" value={fmtP(result.sfRate)}/>
                <StatRow label="Real SF Eff." value={fmtP(result.realSfRate)}/>
                <StatRow label="SF Installment" value={fmtB2(result.sfInstallment)}/>
                <StatRow label="Customer Flat Rate" value={fmtP(result.custFlatRate)}/>
              </>}
              <StatRow label="Rebate Amount" value={fmtB2(result.rebate)}/>
              <StatRow label="Rebate × 0.85" value={fmtB2(result.rebate85)}/>
            </div>
          )}
        </div>
        
        {/* Tax (FL) */}
        {m.hasRV&&(
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-emerald-700">ประโยชน์ทางภาษี (Leasing)</div>
            <div className="space-y-1.5 text-xs text-emerald-900">
              <div>• นำค่างวดหักค่าใช้จ่ายได้สูงสุด 36,000 บาท/เดือน</div>
              <div className="flex justify-between"><span>ประหยัดภาษี (48 เดือน × 20%)</span><span className="font-semibold tabular-nums">{fmtB(result.taxSaving48)}</span></div>
              <div className="flex justify-between"><span>ประหยัดภาษี (60 เดือน × 20%)</span><span className="font-semibold tabular-nums">{fmtB(result.taxSaving60)}</span></div>
            </div>
          </div>
        )}
        
        {/* SUMMARY BUTTON */}
        {result.monthly>0&&(
          <>
            <button
              onClick={()=>setShowSummary(true)}
              className="w-full rounded-xl bg-[#1c69d4] py-3.5 text-sm font-bold text-white shadow-sm active:bg-[#1557b0]"
            >
              📋 ดูสรุปใบเสนอราคา
            </button>
            <button
              onClick={()=>setShowDownTable(true)}
              className="w-full rounded-xl border border-[#1c69d4] py-3.5 text-sm font-bold text-[#1c69d4] active:bg-blue-50"
            >
              📊 ตารางเปรียบเทียบดาวน์
            </button>
          </>
        )}

        {/* Footer Version */}
        <div className="flex items-center justify-between text-[10px] text-neutral-400 pt-2">
          <span>Validity: {validityStr}</span>
          <span className="font-mono">v{APP_VERSION}</span>
        </div>
      </main>
      
      {/* SAVED DRAWER */}
      {showSaved&&(
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={()=>setShowSaved(false)}>
          <div className="w-full max-w-md rounded-t-2xl bg-white p-4 max-h-[80vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-neutral-900">Quotation ที่บันทึก</h3>
              <button onClick={()=>setShowSaved(false)} className="rounded-full p-1 hover:bg-neutral-100"><X size={18}/></button>
            </div>
            {savedList.length===0?<div className="py-8 text-center text-sm text-neutral-500">ยังไม่มีข้อมูลที่บันทึก</div>:(
              <div className="space-y-2">
                {savedList.map(q=>(
                  <div key={q.key} className="flex items-center justify-between rounded-lg border border-neutral-200 p-3 hover:border-[#1c69d4]">
                    <button onClick={()=>loadQuote(q.data)} className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-[#1c69d4] px-1.5 py-0.5 text-[10px] font-bold text-white">{MODES[q.data.mode]?.label}</span>
                        <span className="text-sm font-semibold text-neutral-900">{q.data.customerName||"ไม่ระบุชื่อ"}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-neutral-500 truncate">{q.data.carModel}</div>
                      <div className="mt-1 text-xs font-medium text-[#1c69d4] tabular-nums">{fmtB(q.data.monthly)} บาท/เดือน</div>
                    </button>
                    <button onClick={()=>deleteQuote(q.key)} className="ml-2 rounded p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-500"><Trash2 size={14}/></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* CAR MANAGER */}
      {showCarManager&&<CarManager carDB={carDB} onSave={saveCarDB} onClose={()=>{setShowCarManager(false);setShowSettings(false);}} onBack={()=>setShowCarManager(false)}/>}
      
      {/* SETTINGS - ซ่อนเมื่อ Manager เปิด */}
      {showSettings&&!showCarManager&&!showPromoManager&&!showFreebieManager&&<SettingsDialog salesName={salesName} onSave={saveSalesName} onClose={()=>setShowSettings(false)} onOpenCarManager={()=>setShowCarManager(true)} onOpenPromoManager={()=>setShowPromoManager(true)} onOpenFreebieManager={()=>setShowFreebieManager(true)} onExport={exportAllData} onImport={importAllData}/>}
      
      {/* PROMOTION MANAGER */}
      {showPromoManager&&<PromotionManager currentPromoId={currentPromoId} promotions={promotions} onSave={savePromotions} onClose={()=>{setShowPromoManager(false);setShowSettings(false);}} onBack={()=>setShowPromoManager(false)}/>}
      
      {/* FREEBIE MANAGER */}
      {showFreebieManager&&<FreebieManager items={freebieItems} onSave={saveFreebies} onClose={()=>{setShowFreebieManager(false);setShowSettings(false);}} onBack={()=>setShowFreebieManager(false)}/>}
      
      {/* SUMMARY SCREEN */}
      {showSummary&&(
        <SummaryScreen
          customerName={customerName}
          customerPhone={customerPhone}
          salesName={salesName}
          carModel={carModel}
          mode={mode}
          result={result}
          inputs={inputs}
          discount={discount}
          selectedFreebies={selectedFreebies}
          freebieItems={freebieItems}
          freebieOther={freebieOther}
          redPlateDeposit={redPlateDeposit}
          setRedPlateDeposit={setRedPlateDeposit}
          regFee={regFee}
          setRegFee={setRegFee}
          depositPaid={depositPaid}
          setDepositPaid={setDepositPaid}
          onClose={()=>setShowSummary(false)}
          showToast={showToast}
        />
      )}

      {showDownTable&&(
        <DownTableScreen
          carModel={carModel}
          mode={mode}
          inputs={inputs}
          discount={discount}
          onClose={()=>setShowDownTable(false)}
        />
      )}

      {/* RESET CONFIRM */}
      {showResetConfirm&&(
        <ConfirmDialog 
          title="รีเซ็ตข้อมูลทั้งหมด?"
          message="การรีเซ็ตจะลบข้อมูลทั้งหมดที่กรอกไว้ และไม่สามารถกู้คืนได้"
          onConfirm={handleReset}
          onCancel={()=>setShowResetConfirm(false)}
        />
      )}
      
      {/* TOAST */}
      {toast&&<div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-neutral-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>}
    </div>
  );
}
