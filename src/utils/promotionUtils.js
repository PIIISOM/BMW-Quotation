// deep clone โปรโมชั่น สำหรับฟีเจอร์ "คัดลอกจากโปรโมชั่นอื่น" ใน PromotionManager
// บริสุทธิ์ ไม่ผูกกับ React เทสได้ตรงจาก verify.mjs
export function clonePromotion(srcPromo, now) {
  const cloned = structuredClone(srcPromo);
  cloned.importedAt = now;
  return cloned;
}
