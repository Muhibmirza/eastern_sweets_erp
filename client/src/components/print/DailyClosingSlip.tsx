import dayjs from 'dayjs';
import { EASTERN_SWEETS_LOGO_BASE64 } from '../../constants/logo';
import { pkr } from '../../utils/format';
import { PrintBrandFooter } from './PrintBrandFooter';

export function DailyClosingSlip({ summary, cashier }: { summary: any; cashier?: string }) {
  const paymentRows = summary?.paymentBreakdown || [];
  const payment = (method: string) => paymentRows.find((row: any) => row.paymentMethod === method)?._sum?.netAmount || 0;
  return (
    <div className="thermal-print">
      <div className="print-center"><img src={EASTERN_SWEETS_LOGO_BASE64} alt="Eastern Sweets" style={{ width: 64, height: 64, objectFit: 'contain' }} /><h2>DAILY CLOSING</h2></div>
      <div className="print-line" />
      <div>Date: {dayjs(summary?.date).format('DD-MMM-YYYY')}</div>
      <div>Closed By: {cashier || '-'}</div>
      <div>Time: {dayjs(summary?.closedAt || new Date()).format('hh:mm A')}</div>
      <div className="print-line" />
      <div className="print-row"><span>Total Sales</span><span>{summary?.totalSales || summary?.paymentBreakdown?.reduce((s: number, r: any) => s + (r._count || 0), 0) || 0}</span></div>
      <div className="print-row"><span>Total Revenue</span><span>{pkr(summary?.totalRevenue || summary?.total || 0)}</span></div>
      <h3>PAYMENT BREAKDOWN</h3>
      {['CASH', 'CARD', 'JAZZCASH', 'EASYPAISA'].map((method) => <div className="print-row" key={method}><span>{method}</span><span>{pkr(payment(method))}</span></div>)}
      <div className="print-row"><span>Total Discount Given</span><span>{pkr(summary?.totalDiscount || 0)}</span></div>
      <div className="print-row"><span>Total Expenses Today</span><span>{pkr(summary?.totalExpenses || 0)}</span></div>
      <div className="print-row print-total"><span>Net Cash in Hand</span><span>{pkr(summary?.netCash || summary?.total || 0)}</span></div>
      <div className="print-center">Thank You</div>
      <div className="print-line" />
      <PrintBrandFooter />
    </div>
  );
}
