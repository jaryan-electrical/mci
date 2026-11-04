/*
 * config.js — تنظیمات اتصال سایت به پشتیبان (Google Apps Script)
 * فقط همین فایل را ویرایش کنید. هیچ رمز یا کلید محرمانه‌ای این‌جا نگذارید؛ این فایل عمومی است.
 */
window.JR_CONFIG = {
  /* نشانی وب‌اپ Apps Script (بعد از Deploy ← Web app؛ به /exec ختم می‌شود).
     مثال: 'https://script.google.com/macros/s/AKfycb.../exec' */
  apiUrl: 'https://script.google.com/macros/s/AKfycbwKeycPMTJ6cDk7sgRDOo1Sco5l7IxerUmEMCVLYf1Tu8GcjTRSDqxA1RRnhMem-yDk/exec',

  /* کمترین فاصله‌ی بروزرسانی صفحه‌ی عمومی (میلی‌ثانیه). Apps Script همزمانیِ محدودی دارد؛
     عدد کوچک‌تر یعنی فشار بیشتر در لحظه‌ی شروع ثبت‌نام. */
  minPollMs: 7000,

  /* پراکندگی تصادفی درخواستِ بعد از لحظه‌ی شروع تا هزاران نفر همزمان وضعیت نخواهند */
  openPollJitterMs: 7000,

  /* فاصله‌ی بروزرسانی پنل برگزارکنندگان (میلی‌ثانیه) */
  adminPollMs: 15000,
  adminPollHiddenMs: 90000,

  /* لوگوی همراه اول (اختیاری): فایل را در docs/assets بگذارید و نامش را این‌جا بنویسید.
     مثال: 'assets/mci-logo.svg' */
  mciLogo: ''
};
