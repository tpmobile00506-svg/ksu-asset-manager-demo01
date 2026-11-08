import type { Metadata, Viewport } from 'next';
import '@/frontend/styles/globals.css';
import '@/frontend/styles/source-sheet-grid.css';
import '@/frontend/styles/registry-table.css';
import '@/frontend/styles/qr-sticker.css';
import '@/frontend/styles/request-batch.css';

export const metadata: Metadata = {
  title: 'ทะเบียนครุภัณฑ์ · คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม',
  description: 'ทะเบียนครุภัณฑ์ การตรวจนับ การโอนย้าย และการอนุมัติ มหาวิทยาลัยกาฬสินธุ์',
  icons: {
    icon: '/logo-faculty.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  // แอปมีธีมสว่างธีมเดียว: only light บอกเบราว์เซอร์ไม่ให้บังคับหน้าเว็บเป็นสีเข้ม (เช่น Samsung Internet ตอนมือถือเปิดโหมดมืด)
  colorScheme: 'only light',
  // ตอนคีย์บอร์ดมือถือขึ้น ให้หน้าเว็บหดตามพื้นที่ที่เหลือ หน้าต่างและปุ่มบันทึกจึงไม่ถูกคีย์บอร์ดบัง
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className="antialiased">{children}</body>
    </html>
  );
}
