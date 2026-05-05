/**
 * Input Validation Utilities for BMW Quotation App
 * ใช้สำหรับตรวจสอบความถูกต้องของข้อมูลที่ user ใส่
 */

/**
 * ตรวจสอบความถูกต้องของตัวเลข
 * @param {string|number} value - ค่าที่จะตรวจสอบ
 * @param {number} min - ค่าต่ำสุดที่อนุญาต (default: 0)
 * @param {number} max - ค่าสูงสุดที่อนุญาต (default: Infinity)
 * @returns {{valid: boolean, value?: number, error?: string}}
 */
export const validateNumber = (value, min = 0, max = Infinity) => {
  // กรณีที่เป็น string ว่าง หรือ null/undefined
  if (value === '' || value === null || value === undefined) {
    return { valid: true, value: 0 };
  }

  // แปลงเป็น number
  const num = typeof value === 'string' ? parseFloat(value) : value;

  // ตรวจสอบว่าเป็นตัวเลขจริงๆ
  if (isNaN(num)) {
    return { 
      valid: false, 
      error: 'กรุณาใส่ตัวเลขที่ถูกต้อง' 
    };
  }

  // ตรวจสอบว่าไม่ใช่ Infinity
  if (!isFinite(num)) {
    return { 
      valid: false, 
      error: 'ตัวเลขไม่ถูกต้อง' 
    };
  }

  // ตรวจสอบช่วงค่า
  if (num < min) {
    return { 
      valid: false, 
      error: `ต้องมากกว่าหรือเท่ากับ ${min.toLocaleString()}` 
    };
  }

  if (num > max) {
    return { 
      valid: false, 
      error: `ต้องน้อยกว่าหรือเท่ากับ ${max.toLocaleString()}` 
    };
  }

  return { valid: true, value: num };
};

/**
 * ตรวจสอบเปอร์เซ็นต์ (0-100)
 * @param {string|number} value - ค่าที่จะตรวจสอบ
 * @returns {{valid: boolean, value?: number, error?: string}}
 */
export const validatePercentage = (value) => {
  return validateNumber(value, 0, 100);
};

/**
 * ตรวจสอบเบอร์โทรศัพท์ไทย (10 หลัก)
 * @param {string} phone - เบอร์โทรที่จะตรวจสอบ
 * @returns {{valid: boolean, value?: string, error?: string}}
 */
export const validatePhone = (phone) => {
  // ถ้าไม่ใส่ก็ไม่เป็นไร (optional field)
  if (!phone || phone.trim() === '') {
    return { valid: true, value: '' };
  }

  // ลบอักขระที่ไม่ใช่ตัวเลขออก
  const cleaned = phone.replace(/\D/g, '');
  
  // ต้องมี 10 หลัก
  if (cleaned.length !== 10) {
    return { 
      valid: false, 
      error: 'เบอร์โทรต้องมี 10 หลัก' 
    };
  }

  // ต้องขึ้นต้นด้วย 0
  if (!cleaned.startsWith('0')) {
    return { 
      valid: false, 
      error: 'เบอร์โทรต้องขึ้นต้นด้วย 0' 
    };
  }

  return { valid: true, value: cleaned };
};

/**
 * ตรวจสอบระยะเวลาผ่อน (ต้องเป็นทวีคูณของ 12)
 * @param {string|number} value - จำนวนเดือน
 * @returns {{valid: boolean, value?: number, error?: string}}
 */
export const validateTerm = (value) => {
  const result = validateNumber(value, 1, 120);
  if (!result.valid) return result;

  // ต้องเป็นทวีคูณของ 12
  if (result.value % 12 !== 0) {
    return {
      valid: false,
      error: 'ระยะเวลาต้องเป็นทวีคูณของ 12 เดือน (12, 24, 36, 48, 60...)'
    };
  }

  return result;
};

/**
 * ลบอักขระที่ไม่ใช่ตัวเลขออก (ใช้ก่อน validate)
 * @param {string} value - ค่าที่จะทำความสะอาด
 * @returns {string} - ค่าที่สะอาดแล้ว
 */
export const sanitizeNumberInput = (value) => {
  if (typeof value !== 'string') return value;
  // เก็บเฉพาะตัวเลข จุดทศนิยม และเครื่องหมายลบ
  return value.replace(/[^0-9.-]/g, '');
};

/**
 * ตรวจสอบชื่อ (ต้องไม่ว่าง)
 * @param {string} name - ชื่อที่จะตรวจสอบ
 * @returns {{valid: boolean, value?: string, error?: string}}
 */
export const validateName = (name) => {
  if (!name || name.trim() === '') {
    return {
      valid: false,
      error: 'กรุณาใส่ชื่อ'
    };
  }

  if (name.trim().length < 2) {
    return {
      valid: false,
      error: 'ชื่อต้องมีอย่างน้อย 2 ตัวอักษร'
    };
  }

  return { valid: true, value: name.trim() };
};
